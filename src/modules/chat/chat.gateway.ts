import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  WebSocketServer,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ChatService } from './chat.service';
import { RoomService } from '../room/room.service';
import { SendMessageDto } from './dto/send-message.dto';
import { MessageType } from './entities/message.schema';

@WebSocketGateway({ namespace: '/chat', cors: true })
export class ChatGateway implements OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  // Map socketId → roomId để xử lý disconnect
  private socketRoomMap = new Map<string, string>();

  constructor(
    private readonly chatService: ChatService,
    private readonly roomService: RoomService,
  ) {}

  @SubscribeMessage('room:join')
  async handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string },
  ) {
    const userId = (client as any).userId;
    if (!userId) return;

    try {
      const room = await this.roomService.getRoom(data.roomId);
      const isParticipant = room.participants.some((p) => p.toString() === userId);
      if (!isParticipant) {
        client.emit('error', { message: 'Không có quyền vào phòng này' });
        return;
      }

      client.join(data.roomId);
      this.socketRoomMap.set(client.id, data.roomId);

      const alias = room.anonymousNames?.get?.(userId) || 'Stranger';
      client.emit('room:joined', { roomId: data.roomId, alias });
    } catch {
      client.emit('error', { message: 'Phòng không tồn tại' });
    }
  }

  @SubscribeMessage('chat:send')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: SendMessageDto,
  ) {
    const userId = (client as any).userId;
    if (!userId) return;

    try {
      const room = await this.roomService.getRoom(dto.roomId);
      const alias = room.anonymousNames?.get?.(userId) || 'Stranger';
      const message = await this.chatService.saveMessage(userId, alias, dto);

      this.server.to(dto.roomId).emit('chat:message', {
        id: message._id,
        senderAlias: alias,
        type: message.type,
        content: message.content,
        imageUrl: message.imageUrl,
        createdAt: (message as any).createdAt,
      });
    } catch (err: any) {
      client.emit('error', { message: err.message });
    }
  }

  @SubscribeMessage('chat:typing')
  handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; isTyping: boolean },
  ) {
    const userId = (client as any).userId;
    client.to(data.roomId).emit('chat:typing', { userId, isTyping: data.isTyping });
  }

  @SubscribeMessage('room:leave')
  async handleLeaveRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string },
  ) {
    await this.closeRoomCleanup(data.roomId, client);
  }

  async handleDisconnect(client: Socket) {
    const roomId = this.socketRoomMap.get(client.id);
    if (roomId) {
      await this.closeRoomCleanup(roomId, client);
      this.socketRoomMap.delete(client.id);
    }
  }

  private async closeRoomCleanup(roomId: string, client: Socket) {
    // Thông báo người kia
    client.to(roomId).emit('chat:partner_left');

    // Đóng phòng và xóa tin nhắn
    await this.roomService.closeRoom(roomId);
    await this.chatService.deleteRoomMessages(roomId);

    // Gửi system message trước khi xóa
    this.server.to(roomId).emit('chat:message', {
      type: MessageType.SYSTEM,
      content: 'Đối phương đã rời phòng.',
    });

    client.leave(roomId);
  }
}
