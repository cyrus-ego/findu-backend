import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Server, Socket } from 'socket.io';
import { MatchmakingService } from './matchmaking.service';
import { JoinQueueDto } from './dto/join-queue.dto';
import { RoomService } from '../room/room.service';

const POSITION_INTERVAL_MS = 3000;

@WebSocketGateway({
  namespace: '/matchmaking',
  cors: { origin: true, credentials: true },
})
export class MatchmakingGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(MatchmakingGateway.name);
  private readonly positionTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly matchmakingService: MatchmakingService,
    private readonly roomService: RoomService,
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
      this.logger.log(`Matchmaking connected: ${client.id} (user: ${payload.sub})`);
    } catch {
      this.logger.warn(`Unauthorized matchmaking socket: ${client.id}`);
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    const userId = (client as any).userId as string | undefined;
    if (userId) {
      this.clearPositionTimer(userId);
      await this.matchmakingService.handleDisconnect(userId);
      this.logger.log(`Matchmaking disconnect cleanup: ${userId}`);
    }
  }

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
      const status = await this.matchmakingService.joinQueue(userId, client.id, dto);
      client.emit('queue:joined', status);
      this.startPositionLoop(client, userId);

      await this.attemptMatchAndNotify(userId, client);
    } catch (err: any) {
      client.emit('error', { message: err.message || 'Không thể vào hàng đợi' });
    }
  }

  /** Đồng bộ socketId sau khi đã join qua HTTP API */
  @SubscribeMessage('queue:sync')
  async handleQueueSync(@ConnectedSocket() client: Socket) {
    const userId = (client as any).userId;
    if (!userId) return;

    const pending = await this.matchmakingService.consumePendingMatch(userId);
    if (pending) {
      this.clearPositionTimer(userId);
      client.emit('match:found', pending);
      return;
    }

    await this.matchmakingService.updateSocketId(userId, client.id);
    const status = await this.matchmakingService.getStatus(userId);

    if (status.inQueue) {
      client.emit('queue:joined', status);
      this.startPositionLoop(client, userId);
      await this.attemptMatchAndNotify(userId, client);
    } else if (status.timedOut) {
      client.emit('queue:timeout', { message: 'Hết thời gian chờ (5 phút)' });
    }
  }

  @SubscribeMessage('queue:leave')
  async handleLeaveQueue(@ConnectedSocket() client: Socket) {
    const userId = (client as any).userId;
    if (!userId) return;

    this.clearPositionTimer(userId);
    await this.matchmakingService.leaveQueue(userId);
    client.emit('queue:left');
  }

  private startPositionLoop(client: Socket, userId: string) {
    this.clearPositionTimer(userId);

    const tick = async () => {
      try {
        const status = await this.matchmakingService.getStatus(userId);

        if (status.timedOut) {
          this.clearPositionTimer(userId);
          client.emit('queue:timeout', { message: 'Hết thời gian chờ (5 phút)' });
          await this.matchmakingService.leaveQueue(userId);
          return;
        }

        if (!status.inQueue) {
          this.clearPositionTimer(userId);
          return;
        }

        client.emit('queue:position', status);
        await this.attemptMatchAndNotify(userId, client);
      } catch (err) {
        this.logger.error(`Position loop error for ${userId}: ${err}`);
      }
    };

    void tick();
    const timer = setInterval(tick, POSITION_INTERVAL_MS);
    this.positionTimers.set(userId, timer);
  }

  private clearPositionTimer(userId: string) {
    const timer = this.positionTimers.get(userId);
    if (timer) {
      clearInterval(timer);
      this.positionTimers.delete(userId);
    }
  }

  private async attemptMatchAndNotify(userId: string, client: Socket) {
    const match = await this.matchmakingService.tryAtomicMatch(userId);
    if (!match) return;

    this.clearPositionTimer(userId);

    const room = await this.roomService.createRoom([userId, match.partnerId]);

    const payload = {
      roomId: room.roomId,
      partnerId: match.partnerId,
    };

    client.emit('match:found', payload);

    const partnerPayload = { roomId: room.roomId, partnerId: userId };

    if (match.partnerSocketId.startsWith('pending:')) {
      await this.matchmakingService.setPendingMatch(match.partnerId, partnerPayload);
    } else {
      this.server.to(match.partnerSocketId).emit('match:found', partnerPayload);
      this.clearPositionTimer(match.partnerId);
    }
  }
}
