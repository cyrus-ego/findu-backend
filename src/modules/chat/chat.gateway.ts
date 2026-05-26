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
import { RoomDocument } from '../room/entities/room.schema';
import { ChatMessageDto } from './dto/chat-response.dto';

interface SocketMeta {
  roomId: string;
  userId: string;
}

@WebSocketGateway({
  namespace: '/chat',
  cors: { origin: true, credentials: true },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);
  private readonly socketMeta = new Map<string, SocketMeta>();
  /** roomId → userId → set socketIds */
  private readonly roomPresence = new Map<string, Map<string, Set<string>>>();

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

      (client as any).userId = payload.sub;
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

    if (!this.isUserOnline(meta.roomId, meta.userId)) {
      this.server.to(meta.roomId).emit('room:presence', { userId: meta.userId, online: false });
    }
  }

  @SubscribeMessage('room:join')
  async handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string },
  ) {
    const userId = (client as any).userId as string | undefined;
    if (!userId) {
      client.emit('error', { message: 'Chưa xác thực' });
      return;
    }

    try {
      const room = await this.roomService.getRoom(data.roomId);
      if (!this.roomService.isParticipant(room, userId)) {
        // Emit event riêng để frontend có thể redirect chính xác thay vì hiển thị lỗi generic.
        client.emit('room:access_denied', { roomId: data.roomId, message: 'Không có quyền vào phòng này' });
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
      // Phòng không tồn tại hoặc đã đóng — emit access_denied để frontend xóa cookie stale.
      client.emit('room:access_denied', { roomId: data.roomId, message: 'Phòng không tồn tại hoặc đã đóng' });
    }
  }

  @SubscribeMessage('chat:send')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: SendMessageDto,
  ) {
    const userId = (client as any).userId as string | undefined;
    if (!userId) return;

    if (dto.type !== MessageType.TEXT || !dto.content?.trim()) {
      client.emit('error', { message: 'Tin nhắn không hợp lệ' });
      return;
    }

    try {
      const room = await this.roomService.getRoom(dto.roomId);
      this.ensureSocketJoinedRoom(client, dto.roomId, userId);
      const partnerId = this.roomService.getPartnerUserId(room, userId);
      if (partnerId && (await this.blocklistService.isBlocked(userId, partnerId))) {
        client.emit('error', { message: 'Không thể gửi tin nhắn' });
        return;
      }

      const alias = this.roomService.getAlias(room, userId);
      const message = await this.chatService.saveMessage(userId, alias, {
        ...dto,
        content: dto.content.trim(),
        type: MessageType.TEXT,
      });

      const payload = this.chatService.toMessagePayload(message, alias);
      this.server.to(dto.roomId).emit('chat:message', payload);
    } catch (err: any) {
      const msg = err?.response?.message || err?.message || 'Không gửi được tin nhắn';
      client.emit('error', { message: Array.isArray(msg) ? msg[0] : msg });
    }
  }

  @SubscribeMessage('chat:typing')
  handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; isTyping: boolean },
  ) {
    const userId = (client as any).userId;
    if (!userId) return;
    this.ensureSocketJoinedRoom(client, data.roomId, userId);

    client.to(data.roomId).emit('chat:typing', { isTyping: data.isTyping });
  }

  /** Chủ động rời phòng → đóng phòng và xóa tin nhắn */
  @SubscribeMessage('room:leave')
  async handleLeaveRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string },
  ) {
    const userId = (client as any).userId as string | undefined;
    if (!userId) return;

    await this.closeRoom(data.roomId, 'Đối phương đã rời phòng.', client);
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
        client.emit('error', { message: 'Không có quyền' });
        return;
      }

      await this.blocklistService.block(userId, data.targetUserId);
      await this.closeRoom(data.roomId, 'Phòng đã đóng do chặn người dùng.', client);
    } catch (err: any) {
      client.emit('error', { message: err?.message || 'Không thể chặn' });
    }
  }

  broadcastMessage(roomId: string, payload: Record<string, unknown> | ChatMessageDto) {
    this.server.to(roomId).emit('chat:message', payload);
  }

  isUserOnlineInRoom(roomId: string, userId: string): boolean {
    return this.isUserOnline(roomId, userId);
  }

  private addSocketToPresence(roomId: string, userId: string, socketId: string) {
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
      }
    }

    if (roomMap.size === 0) {
      this.roomPresence.delete(roomId);
    }
  }

  private isUserOnline(roomId: string, userId: string): boolean {
    const roomMap = this.roomPresence.get(roomId);
    const sockets = roomMap?.get(userId);
    return !!sockets && sockets.size > 0;
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

    client.join(roomId);
    this.socketMeta.set(client.id, { roomId, userId });
    this.addSocketToPresence(roomId, userId, client.id);
  }

  private async closeRoom(roomId: string, systemMessage: string, initiatingClient?: Socket) {
    try {
      const room = await this.roomService.getRoom(roomId);
      await this.finalizeRoom(room, roomId, systemMessage);
    } catch {
      // Phòng có thể đã đóng
    }

    this.roomPresence.delete(roomId);

    if (initiatingClient) {
      initiatingClient.leave(roomId);
      this.socketMeta.delete(initiatingClient.id);
    }

    this.server.in(roomId).socketsLeave(roomId);
  }

  private async finalizeRoom(_room: RoomDocument, roomId: string, systemMessage: string) {
    this.server.to(roomId).emit('chat:message', {
      id: `system-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      senderAlias: 'System',
      type: MessageType.SYSTEM,
      content: systemMessage,
      createdAt: new Date().toISOString(),
    });

    this.server.to(roomId).emit('room:closed', { roomId });

    await this.roomService.closeRoom(roomId);
    await this.chatService.deleteRoomMessages(roomId);

    for (const uid of _room.participants.map((p) => p.toString())) {
      this.moderationService.clearSpamTracker(uid, roomId);
    }
  }
}
