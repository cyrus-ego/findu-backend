import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { MatchmakingService } from './matchmaking.service';
import { JoinQueueDto } from './dto/join-queue.dto';

@WebSocketGateway({ namespace: '/matchmaking', cors: true })
export class MatchmakingGateway {
  @WebSocketServer()
  server: Server;

  constructor(private readonly matchmakingService: MatchmakingService) {}

  @SubscribeMessage('queue:join')
  async handleJoinQueue(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: JoinQueueDto,
  ) {
    const userId = (client as any).userId;
    if (!userId) {
      client.emit('error', { message: 'Chưa xác thực' });
      return;
    }

    try {
      await this.matchmakingService.joinQueue(userId, client.id, dto);
      const position = await this.matchmakingService.getQueuePosition(userId);
      client.emit('queue:joined', { position });

      // Thử ghép đôi ngay lập tức
      await this.tryMatch(userId, client);
    } catch (err: any) {
      client.emit('error', { message: err.message });
    }
  }

  @SubscribeMessage('queue:leave')
  async handleLeaveQueue(@ConnectedSocket() client: Socket) {
    const userId = (client as any).userId;
    if (userId) {
      await this.matchmakingService.leaveQueue(userId);
      client.emit('queue:left');
    }
  }

  private async tryMatch(userId: string, client: Socket) {
    const match = await this.matchmakingService.findMatch(userId, []);
    if (!match) return;

    // Xóa cả hai khỏi queue
    await this.matchmakingService.leaveQueue(userId);
    await this.matchmakingService.leaveQueue(match.userId);

    const roomId = `room_${Date.now()}`;

    // Thông báo cho cả hai
    client.emit('match:found', { roomId, partnerId: match.userId });
    this.server.to(match.socketId).emit('match:found', { roomId, partnerId: userId });
  }
}
