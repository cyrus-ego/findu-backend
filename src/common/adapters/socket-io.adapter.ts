import { IoAdapter } from '@nestjs/platform-socket.io';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';

export class CustomIoAdapter extends IoAdapter {
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

    const serverOptions = {
      ...options,
      cors: corsOptions,
    };

    return super.createIOServer(port, serverOptions);
  }
}
