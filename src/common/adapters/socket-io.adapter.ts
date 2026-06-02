import { Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';

export class CustomIoAdapter extends IoAdapter {
  private readonly logger = new Logger(CustomIoAdapter.name);

  constructor(
    app: NestExpressApplication,
    private readonly config: ConfigService,
  ) {
    super(app);
  }

  createIOServer(port: number, options?: any): any {
    const isProduction =
      this.config.get<string>('NODE_ENV', 'development') === 'production';

    const corsOptions: any = {
      origin: true,
      credentials: true,
    };

    if (!isProduction) {
      const frontendUrl = this.config.get<string>('FRONTEND_URL', 'http://localhost:3001');
      const extra = this.config.get<string>('CORS_ORIGINS', '');
      const origins = [frontendUrl, ...extra.split(',').map((s: string) => s.trim()).filter(Boolean)];

      if (origins.length > 0) {
        corsOptions.origin = (origin: string, callback: (err: Error | null, allow?: boolean) => void) => {
          if (!origin) {
            callback(null, true);
            return;
          }
          if (origins.includes(origin)) {
            callback(null, true);
            return;
          }
          try {
            const host = new URL(origin).hostname;
            if (host.endsWith('.ngrok-free.app') || host.endsWith('.ngrok.io') || host.endsWith('.ngrok.app')) {
              callback(null, true);
              return;
            }
          } catch {}
          callback(new Error(`Origin ${origin} not allowed by CORS`));
        };
      }
    }

    const server = super.createIOServer(port, {
      ...options,
      cors: corsOptions,
    });

    const redisUrl = this.config.get<string>('REDIS_URL');
    let pubClient: Redis;
    let subClient: Redis;

    if (redisUrl) {
      pubClient = new Redis(redisUrl);
      subClient = new Redis(redisUrl);
    } else {
      const redisHost = this.config.get<string>('REDIS_HOST', 'localhost');
      const redisPort = this.config.get<number>('REDIS_PORT', 6379);
      const redisPassword = this.config.get<string>('REDIS_PASSWORD') || undefined;

      pubClient = new Redis({ host: redisHost, port: redisPort, password: redisPassword });
      subClient = new Redis({ host: redisHost, port: redisPort, password: redisPassword });
    }

    pubClient.on('error', (err) =>
      this.logger.error(`Redis pub error: ${err.message}`, err.stack),
    );
    subClient.on('error', (err) =>
      this.logger.error(`Redis sub error: ${err.message}`, err.stack),
    );
    pubClient.on('connect', () => this.logger.log('Redis pub connected'));
    subClient.on('connect', () => this.logger.log('Redis sub connected'));

    server.adapter(createAdapter(pubClient, subClient));

    return server;
  }
}
