import { Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import { createCorsOriginDelegate } from '../../config/cors.util';

export class CustomIoAdapter extends IoAdapter {
  private readonly logger = new Logger(CustomIoAdapter.name);

  constructor(
    app: NestExpressApplication,
    private readonly config: ConfigService,
  ) {
    super(app);
  }

  createIOServer(port: number, options?: any): any {
    const server = super.createIOServer(port, {
      ...options,
      cors: {
        origin: createCorsOriginDelegate(this.config),
        credentials: true,
      },
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
