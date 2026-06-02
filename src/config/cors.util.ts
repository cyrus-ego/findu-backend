import { ConfigService } from '@nestjs/config';
import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

/** Danh sách origin tường minh từ env (FRONTEND_URL + CORS_ORIGINS) */
export function getCorsAllowedOrigins(config: ConfigService): string[] {
  const origins = new Set<string>();

  const frontendUrl = config.get<string>('FRONTEND_URL');
  if (frontendUrl?.trim()) {
    origins.add(frontendUrl.trim());
  }

  const extra = config.get<string>('CORS_ORIGINS', '');
  for (const o of extra.split(',').map((s) => s.trim()).filter(Boolean)) {
    origins.add(o);
  }

  return [...origins];
}

export function isProductionEnv(config: ConfigService): boolean {
  return config.get<string>('NODE_ENV', 'development') === 'production';
}

function isLocalhostOrigin(origin: string): boolean {
  try {
    const { hostname } = new URL(origin);
    return hostname === 'localhost' || hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

function isNgrokOrigin(origin: string): boolean {
  try {
    const host = new URL(origin).hostname;
    return (
      host.endsWith('.ngrok-free.app') ||
      host.endsWith('.ngrok.io') ||
      host.endsWith('.ngrok.app')
    );
  } catch {
    return false;
  }
}

/**
 * Production: chỉ FRONTEND_URL + CORS_ORIGINS.
 * Dev: thêm localhost (Swagger UI) và ngrok tunnel.
 */
export function isOriginAllowed(config: ConfigService, origin?: string): boolean {
  // Postman, curl, server-to-server — không gửi Origin
  if (!origin) {
    return true;
  }

  if (getCorsAllowedOrigins(config).includes(origin)) {
    return true;
  }

  if (isProductionEnv(config)) {
    return false;
  }

  return isLocalhostOrigin(origin) || isNgrokOrigin(origin);
}

/** Delegate dùng chung cho HTTP (Nest) và Socket.IO */
export function createCorsOriginDelegate(
  config: ConfigService,
): (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => void {
  return (origin, callback) => {
    if (isOriginAllowed(config, origin)) {
      callback(null, true);
      return;
    }
    callback(null, false);
  };
}

export function buildCorsOptions(config: ConfigService): CorsOptions {
  return {
    origin: createCorsOriginDelegate(config),
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'Accept'],
    exposedHeaders: ['X-Request-Id'],
  };
}
