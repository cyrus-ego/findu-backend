import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { applicationDefault, cert, getApps, initializeApp, App } from 'firebase-admin/app';
import { BatchResponse, getMessaging, MulticastMessage } from 'firebase-admin/messaging';
import { Model, Types } from 'mongoose';
import { RegisterFcmTokenDto } from './dto/fcm-token.dto';
import { FcmToken, FcmTokenDocument, DevicePlatform } from './entities/fcm-token.schema';

interface ChatNotificationInput {
  recipientId: string;
  roomId: string;
  messageId: string;
  senderAlias: string;
  body: string;
  type: 'text' | 'image';
}

interface MatchNotificationInput {
  recipientId: string;
  roomId: string;
}

type ServiceAccountJson = {
  project_id?: string;
  client_email?: string;
  private_key?: string;
};

const MAX_MULTICAST_TOKENS = 500;
const CHAT_MESSAGE_TITLE = 'Tin nhắn mới';
const MATCH_FOUND_TITLE = 'Đã ghép đôi';

@Injectable()
export class NotificationService implements OnModuleInit {
  private readonly logger = new Logger(NotificationService.name);
  private readonly activeChatViews = new Map<string, string>();
  private readonly activeMatchmakingUsers = new Set<string>();
  private firebaseApp?: App;

  constructor(
    @InjectModel(FcmToken.name)
    private readonly fcmTokenModel: Model<FcmTokenDocument>,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    if (this.config.get<string>('FCM_DISABLED') === 'true') {
      this.logger.warn('FCM is disabled by FCM_DISABLED=true');
      return;
    }

    const serviceAccountJson = this.config.get<string>('FIREBASE_SERVICE_ACCOUNT_JSON')?.trim();
    const projectId = this.config.get<string>('FIREBASE_PROJECT_ID')?.trim();
    const hasApplicationCredentials = !!process.env.GOOGLE_APPLICATION_CREDENTIALS;

    if (!serviceAccountJson && !projectId && !hasApplicationCredentials) {
      this.logger.warn(
        'FCM is not configured. Set FIREBASE_SERVICE_ACCOUNT_JSON, FIREBASE_PROJECT_ID, or GOOGLE_APPLICATION_CREDENTIALS.',
      );
      return;
    }

    try {
      if (getApps().length > 0) {
        this.firebaseApp = getApps()[0];
        return;
      }

      if (serviceAccountJson) {
        const credentials = this.parseServiceAccountJson(serviceAccountJson);
        this.firebaseApp = initializeApp({
          credential: cert(credentials as any),
          projectId: projectId || credentials.project_id,
        });
        return;
      }

      this.firebaseApp = initializeApp({
        credential: applicationDefault(),
        projectId: projectId || undefined,
      });
    } catch (err) {
      this.logger.error(`Unable to initialize Firebase Admin: ${(err as Error).message}`);
    }
  }

  async registerToken(userId: string, dto: RegisterFcmTokenDto): Promise<void> {
    const token = dto.token.trim();
    if (!token) return;

    await this.fcmTokenModel
      .findOneAndUpdate(
        { token },
        {
          $set: {
            userId: new Types.ObjectId(userId),
            token,
            platform: dto.platform || DevicePlatform.UNKNOWN,
            deviceId: dto.deviceId || '',
            lastSeenAt: new Date(),
            disabledAt: null,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      )
      .exec();
  }

  async unregisterToken(userId: string, token: string): Promise<void> {
    await this.fcmTokenModel
      .deleteOne({ userId: new Types.ObjectId(userId), token: token.trim() })
      .exec();
  }

  markChatView(userId: string, roomId: string, visible: boolean): void {
    if (visible) {
      this.activeChatViews.set(userId, roomId);
      return;
    }

    if (this.activeChatViews.get(userId) === roomId) {
      this.activeChatViews.delete(userId);
    }
  }

  clearUserChatView(userId: string): void {
    this.activeChatViews.delete(userId);
  }

  markMatchmakingView(userId: string, visible: boolean): void {
    if (visible) {
      this.activeMatchmakingUsers.add(userId);
      return;
    }

    this.activeMatchmakingUsers.delete(userId);
  }

  isUserViewingChatRoom(userId: string, roomId: string): boolean {
    return this.activeChatViews.get(userId) === roomId;
  }

  isUserActiveInMatchmaking(userId: string): boolean {
    return this.activeMatchmakingUsers.has(userId);
  }

  async sendChatMessage(input: ChatNotificationInput): Promise<void> {
    if (this.isUserViewingChatRoom(input.recipientId, input.roomId)) return;

    const body =
      input.type === 'image'
        ? 'Bạn vừa nhận được một hình ảnh.'
        : this.truncate(input.body.trim(), 120) || 'Bạn vừa nhận được một tin nhắn.';

    await this.sendToUser(input.recipientId, {
      notification: {
        title: CHAT_MESSAGE_TITLE,
        body,
      },
      data: {
        kind: 'chat_message',
        roomId: input.roomId,
        messageId: input.messageId,
        senderAlias: input.senderAlias,
        messageType: input.type,
      },
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
          tag: `chat:${input.roomId}`,
        },
      },
      apns: {
        headers: { 'apns-priority': '10' },
        payload: { aps: { sound: 'default' } },
      },
    });
  }

  async sendMatchFound(input: MatchNotificationInput): Promise<void> {
    if (this.isUserActiveInMatchmaking(input.recipientId)) return;

    await this.sendToUser(input.recipientId, {
      notification: {
        title: MATCH_FOUND_TITLE,
        body: 'Có người phù hợp đang chờ bạn trong phòng chat.',
      },
      data: {
        kind: 'match_found',
        roomId: input.roomId,
      },
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
          tag: `match:${input.roomId}`,
        },
      },
      apns: {
        headers: { 'apns-priority': '10' },
        payload: { aps: { sound: 'default' } },
      },
    });
  }

  private async sendToUser(userId: string, message: Omit<MulticastMessage, 'tokens'>) {
    if (!this.firebaseApp) return;

    const tokens = await this.fcmTokenModel
      .find({
        userId: new Types.ObjectId(userId),
        disabledAt: null,
      })
      .select({ token: 1 })
      .lean()
      .exec();

    if (tokens.length === 0) return;

    for (let i = 0; i < tokens.length; i += MAX_MULTICAST_TOKENS) {
      const batch = tokens.slice(i, i + MAX_MULTICAST_TOKENS).map((item) => item.token);
      try {
        const response = await getMessaging(this.firebaseApp).sendEachForMulticast({
          ...message,
          tokens: batch,
        });
        await this.disableInvalidTokens(batch, response);
      } catch (err) {
        this.logger.warn(`FCM send failed for user ${userId}: ${(err as Error).message}`);
      }
    }
  }

  private async disableInvalidTokens(tokens: string[], response: BatchResponse): Promise<void> {
    const invalidTokens = response.responses
      .map((result, index) => ({ result, token: tokens[index] }))
      .filter(({ result }) => !result.success && this.isInvalidTokenError(result.error?.code))
      .map(({ token }) => token);

    if (invalidTokens.length === 0) return;

    await this.fcmTokenModel
      .updateMany({ token: { $in: invalidTokens } }, { $set: { disabledAt: new Date() } })
      .exec();
  }

  private isInvalidTokenError(code?: string): boolean {
    return (
      code === 'messaging/invalid-registration-token' ||
      code === 'messaging/registration-token-not-registered'
    );
  }

  private parseServiceAccountJson(raw: string): ServiceAccountJson {
    const parsed = JSON.parse(raw) as ServiceAccountJson;
    if (parsed.private_key) {
      parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
    }
    return parsed;
  }

  private truncate(value: string, max: number): string {
    if (value.length <= max) return value;
    return `${value.slice(0, max - 3)}...`;
  }
}
