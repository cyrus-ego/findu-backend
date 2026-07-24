import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Server, Socket } from 'socket.io';
import { ChatService } from './chat.service';
import { RoomService } from '../room/room.service';
import { SendMessageDto } from './dto/send-message.dto';
import { MessageType } from './entities/message.schema';
import { ModerationService } from '../moderation/moderation.service';
import { BlocklistService } from '../blocklist/blocklist.service';
import { RoomDocument, RoomStatus } from '../room/entities/room.schema';
import { ChatMessageDto } from './dto/chat-response.dto';
import { ChatErrorCode, ChatErrorPayload } from './chat-error-code';

interface SocketMeta {
  roomId: string;
  userId: string;
}

const MOBILE_PRESENCE_TTL = 60_000; // Grace window cho app background/reconnect ngắn

@WebSocketGateway({
  namespace: '/chat',
  cors: { origin: true, credentials: true },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server?: Server;

  private readonly logger = new Logger(ChatGateway.name);
  private readonly socketMeta = new Map<string, SocketMeta>();
  /** roomId → userId → set socketIds */
  private readonly roomPresence = new Map<string, Map<string, Set<string>>>();
  private readonly lastSeenAt = new Map<string, number>();
  private readonly offlineTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly chatService: ChatService,
    private readonly roomService: RoomService,
    private readonly moderationService: ModerationService,
    private readonly blocklistService: BlocklistService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify<{ sub: string }>(token, {
        secret: this.config.get<string>('JWT_SECRET'),
      });

      const userId = payload.sub;
      (client as any).userId = userId;

      // Auto-rejoin phòng đang active — xử lý trường hợp browser treo lâu ngày
      try {
        const room = await this.roomService.getActiveRoomForUser(userId);
        if (room) {
          this.ensureSocketJoinedRoom(client, room.roomId, userId);
        }
      } catch {
        // Không có phòng active — bỏ qua
      }
    } catch {
      this.logger.warn(`Unauthorized chat socket: ${client.id}`);
      client.disconnect();
    }
  }

  /** Mất kết nối ≠ rời phòng — chỉ cập nhật presence, phòng vẫn active */
  async handleDisconnect(client: Socket) {
    const meta = this.socketMeta.get(client.id);
    if (!meta) return;

    this.removeSocketFromPresence(meta.roomId, meta.userId, client.id);
    this.socketMeta.delete(client.id);
    client.leave(meta.roomId);

    if (!this.hasActiveSocket(meta.roomId, meta.userId)) {
      this.scheduleOfflinePresence(meta.roomId, meta.userId);
    }
  }

  @SubscribeMessage('room:join')
  async handleJoinRoom(@ConnectedSocket() client: Socket, @MessageBody() data: { roomId: string }) {
    const userId = (client as any).userId as string | undefined;
    if (!userId) {
      this.emitError(client, ChatErrorCode.ACCESS_DENIED, 'Chưa xác thực');
      return;
    }

    try {
      const room = await this.roomService.getRoomAnyStatus(data.roomId);
      if (!room) {
        client.emit('room:closed', {
          roomId: data.roomId,
          reason: ChatErrorCode.ROOM_CLOSED,
          message: 'Phòng không tồn tại hoặc đã hết hiệu lực',
        });
        return;
      }

      if (!this.roomService.isParticipant(room, userId)) {
        // Emit event riêng để frontend có thể redirect chính xác thay vì hiển thị lỗi generic.
        client.emit('room:access_denied', {
          code: ChatErrorCode.ACCESS_DENIED,
          roomId: data.roomId,
          message: 'Không có quyền vào phòng này',
        });
        return;
      }

      if (room.status !== RoomStatus.ACTIVE) {
        client.emit('room:closed', {
          roomId: data.roomId,
          reason: ChatErrorCode.ROOM_CLOSED,
          message: 'Phòng đã đóng',
        });
        return;
      }

      this.ensureSocketJoinedRoom(client, data.roomId, userId);

      const partnerId = this.roomService.getPartnerUserId(room, userId);
      const partnerOnline = partnerId ? this.isUserOnline(data.roomId, partnerId) : false;

      const session = await this.roomService.getRoomSession(data.roomId, userId, partnerOnline);
      const messages = await this.chatService.getActiveRoomMessages(data.roomId);
      const alias = this.roomService.getAlias(room, userId);

      const base = this.config.get<string>(
        'APP_URL',
        `http://localhost:${this.config.get<number>('PORT', 3000)}`,
      );
      const history = messages.map((m) => {
        const msgAlias =
          m.senderId.toString() === userId
            ? alias
            : this.roomService.getAlias(room, m.senderId.toString());
        const payload = this.chatService.toMessagePayload(m, msgAlias);
        if (payload.imageUrl && payload.imageUrl.startsWith('/')) {
          payload.imageUrl = `${base}${payload.imageUrl}`;
        }
        return payload;
      });

      client.emit('room:joined', {
        session,
        partnerUserId: partnerId,
        messages: history,
      });

      client.to(data.roomId).emit('room:presence', { userId, online: true });
    } catch {
      client.emit('room:closed', {
        roomId: data.roomId,
        reason: ChatErrorCode.ROOM_CLOSED,
        message: 'Phòng không tồn tại hoặc đã hết hiệu lực',
      });
    }
  }

  @SubscribeMessage('chat:send')
  async handleSendMessage(@ConnectedSocket() client: Socket, @MessageBody() dto: SendMessageDto) {
    const userId = (client as any).userId as string | undefined;
    if (!userId) return;

    if (dto.type !== MessageType.TEXT || !dto.content?.trim()) {
      this.emitError(client, ChatErrorCode.MESSAGE_SEND_FAILED, 'Tin nhắn không hợp lệ');
      return;
    }

    try {
      const room = await this.roomService.getRoom(dto.roomId);
      if (!this.roomService.isParticipant(room, userId)) {
        this.emitError(
          client,
          ChatErrorCode.ACCESS_DENIED,
          'Không có quyền gửi tin trong phòng này',
        );
        return;
      }

      const partnerId = this.roomService.getPartnerUserId(room, userId);
      if (partnerId && (await this.blocklistService.isBlocked(userId, partnerId))) {
        this.emitError(client, ChatErrorCode.ACCESS_DENIED, 'Không thể gửi tin nhắn');
        return;
      }

      this.ensureSocketJoinedRoom(client, dto.roomId, userId);

      const alias = this.roomService.getAlias(room, userId);
      const message = await this.chatService.saveMessage(userId, alias, {
        ...dto,
        content: dto.content.trim(),
        type: MessageType.TEXT,
      });

      const payload = this.chatService.toMessagePayload(message, alias);
      this.io.to(dto.roomId).emit('chat:message', payload);
    } catch (err: any) {
      this.emitError(client, this.getSendErrorCode(err), this.getErrorMessage(err));
    }
  }

  @SubscribeMessage('chat:typing')
  async handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; isTyping: boolean },
  ) {
    const userId = (client as any).userId as string | undefined;
    if (!userId) return;

    try {
      const room = await this.roomService.getRoom(data.roomId);
      if (!this.roomService.isParticipant(room, userId)) {
        this.emitError(client, ChatErrorCode.ACCESS_DENIED, 'Không có quyền trong phòng này');
        return;
      }

      this.ensureSocketJoinedRoom(client, data.roomId, userId);
      client.to(data.roomId).emit('chat:typing', { isTyping: data.isTyping });
    } catch {
      this.emitError(client, ChatErrorCode.ROOM_CLOSED, 'Phòng đã đóng');
    }
  }

  /** Chủ động rời phòng → đóng phòng và xóa tin nhắn */
  @SubscribeMessage('room:leave')
  async handleLeaveRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string },
  ) {
    const userId = (client as any).userId as string | undefined;
    if (!userId) return;

    try {
      const room = await this.roomService.getRoom(data.roomId);
      if (!this.roomService.isParticipant(room, userId)) {
        this.emitError(client, ChatErrorCode.ACCESS_DENIED, 'Không có quyền trong phòng này');
        return;
      }

      await this.closeRoomAndNotify(data.roomId, 'Đối phương đã rời phòng.', client);
    } catch {
      this.emitError(client, ChatErrorCode.ROOM_CLOSED, 'Phòng đã đóng');
    }
  }

  @SubscribeMessage('room:block')
  async handleBlockInRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; targetUserId: string },
  ) {
    const userId = (client as any).userId as string | undefined;
    if (!userId) return;

    try {
      const room = await this.roomService.getRoom(data.roomId);
      if (!this.roomService.isParticipant(room, userId)) {
        this.emitError(client, ChatErrorCode.ACCESS_DENIED, 'Không có quyền');
        return;
      }

      await this.blocklistService.block(userId, data.targetUserId);
      await this.closeRoomAndNotify(data.roomId, 'Phòng đã đóng do chặn người dùng.', client);
    } catch (err: any) {
      this.emitError(client, ChatErrorCode.MESSAGE_SEND_FAILED, err?.message || 'Không thể chặn');
    }
  }

  broadcastMessage(roomId: string, payload: Record<string, unknown> | ChatMessageDto) {
    this.io.to(roomId).emit('chat:message', payload);
  }

  isUserOnlineInRoom(roomId: string, userId: string): boolean {
    return this.isUserOnline(roomId, userId);
  }

  private addSocketToPresence(roomId: string, userId: string, socketId: string) {
    const key = this.presenceKey(roomId, userId);
    this.clearOfflineTimer(key);
    this.lastSeenAt.delete(key);

    if (!this.roomPresence.has(roomId)) {
      this.roomPresence.set(roomId, new Map());
    }
    const roomMap = this.roomPresence.get(roomId)!;
    if (!roomMap.has(userId)) {
      roomMap.set(userId, new Set());
    }
    roomMap.get(userId)!.add(socketId);
  }

  private removeSocketFromPresence(roomId: string, userId: string, socketId: string) {
    const roomMap = this.roomPresence.get(roomId);
    if (!roomMap) return;

    const sockets = roomMap.get(userId);
    if (sockets) {
      sockets.delete(socketId);
      if (sockets.size === 0) {
        roomMap.delete(userId);
        this.lastSeenAt.set(this.presenceKey(roomId, userId), Date.now());
      }
    }

    if (roomMap.size === 0) {
      this.roomPresence.delete(roomId);
    }
  }

  private isUserOnline(roomId: string, userId: string): boolean {
    if (this.hasActiveSocket(roomId, userId)) return true;

    const lastSeen = this.lastSeenAt.get(this.presenceKey(roomId, userId));
    if (!lastSeen) return false;

    return Date.now() - lastSeen < this.getPresenceTtlMs();
  }

  private hasActiveSocket(roomId: string, userId: string): boolean {
    const roomMap = this.roomPresence.get(roomId);
    const sockets = roomMap?.get(userId);
    return !!sockets && sockets.size > 0;
  }

  private scheduleOfflinePresence(roomId: string, userId: string): void {
    const key = this.presenceKey(roomId, userId);
    this.clearOfflineTimer(key);

    const timer = setTimeout(() => {
      this.offlineTimers.delete(key);

      if (this.hasActiveSocket(roomId, userId)) return;

      const lastSeen = this.lastSeenAt.get(key);
      if (lastSeen && Date.now() - lastSeen < this.getPresenceTtlMs()) {
        this.scheduleOfflinePresence(roomId, userId);
        return;
      }

      this.lastSeenAt.delete(key);
      this.io.to(roomId).emit('room:presence', { userId, online: false });
    }, this.getPresenceTtlMs());

    this.offlineTimers.set(key, timer);
  }

  private getPresenceTtlMs(): number {
    return this.config.get<number>('CHAT_PRESENCE_TTL_MS', MOBILE_PRESENCE_TTL);
  }

  private presenceKey(roomId: string, userId: string): string {
    return `${roomId}:${userId}`;
  }

  private clearOfflineTimer(key: string): void {
    const timer = this.offlineTimers.get(key);
    if (!timer) return;

    clearTimeout(timer);
    this.offlineTimers.delete(key);
  }

  private clearRoomPresence(roomId: string): void {
    this.roomPresence.delete(roomId);

    const prefix = `${roomId}:`;
    for (const key of this.lastSeenAt.keys()) {
      if (key.startsWith(prefix)) {
        this.lastSeenAt.delete(key);
      }
    }

    for (const key of this.offlineTimers.keys()) {
      if (key.startsWith(prefix)) {
        this.clearOfflineTimer(key);
      }
    }
  }

  /**
   * Bảo vệ khỏi race condition: một số client emit chat:send trước room:join hoàn tất.
   * Hàm này đảm bảo socket hiện tại đã vào đúng room trước khi xử lý event chat.
   */
  private ensureSocketJoinedRoom(client: Socket, roomId: string, userId: string): void {
    const meta = this.socketMeta.get(client.id);
    if (meta?.roomId === roomId && meta.userId === userId) {
      return;
    }

    if (meta) {
      client.leave(meta.roomId);
      this.removeSocketFromPresence(meta.roomId, meta.userId, client.id);
      if (!this.hasActiveSocket(meta.roomId, meta.userId)) {
        this.scheduleOfflinePresence(meta.roomId, meta.userId);
      }
    }

    client.join(roomId);
    this.socketMeta.set(client.id, { roomId, userId });
    this.addSocketToPresence(roomId, userId, client.id);
  }

  async closeRoomAndNotify(roomId: string, systemMessage: string, initiatingClient?: Socket) {
    try {
      const room = await this.roomService.getRoom(roomId);
      await this.finalizeRoom(room, roomId, systemMessage);
    } catch {
      // Phòng có thể đã đóng
    }

    this.clearRoomPresence(roomId);

    if (initiatingClient) {
      initiatingClient.leave(roomId);
    }

    for (const [socketId, meta] of this.socketMeta.entries()) {
      if (meta.roomId === roomId) {
        this.socketMeta.delete(socketId);
      }
    }

    this.io.in(roomId).socketsLeave(roomId);
  }

  private async finalizeRoom(_room: RoomDocument, roomId: string, systemMessage: string) {
    this.io
      .to(roomId)
      .emit('chat:message', this.createSystemMessagePayload(roomId, systemMessage));

    this.io.to(roomId).emit('room:closed', {
      roomId,
      reason: ChatErrorCode.ROOM_CLOSED,
      message: 'Phòng đã đóng',
    });

    await this.roomService.closeRoom(roomId);
    await this.chatService.deleteRoomMessages(roomId);

    for (const uid of _room.participants.map((p) => p.toString())) {
      this.moderationService.clearSpamTracker(uid, roomId);
    }
  }

  private createSystemMessagePayload(roomId: string, content: string): ChatMessageDto {
    const createdAt = new Date();
    return {
      id: `system-${roomId}-${createdAt.getTime()}`,
      senderAlias: 'System',
      type: MessageType.SYSTEM,
      content,
      createdAt: createdAt.toISOString(),
    };
  }

  private emitError(client: Socket, code: ChatErrorCode, message: string): void {
    const payload: ChatErrorPayload = { code, message };
    client.emit('error', payload);
  }

  private get io(): Server {
    if (!this.server) {
      throw new Error('ChatGateway Socket.IO server has not been initialized');
    }

    return this.server;
  }

  private getErrorMessage(err: any): string {
    const response = typeof err?.getResponse === 'function' ? err.getResponse() : err?.response;
    const msg = response?.message || err?.message || 'Không gửi được tin nhắn';
    return Array.isArray(msg) ? msg[0] : msg;
  }

  private getSendErrorCode(err: any): ChatErrorCode {
    const response = typeof err?.getResponse === 'function' ? err.getResponse() : err?.response;
    const rawCode = response?.code;

    if (Object.values(ChatErrorCode).includes(rawCode)) {
      return rawCode;
    }

    if (rawCode === 'ROOM_NOT_FOUND') {
      return ChatErrorCode.ROOM_CLOSED;
    }

    return ChatErrorCode.MESSAGE_SEND_FAILED;
  }
}
