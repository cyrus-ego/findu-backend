import { ConfigService } from '@nestjs/config';

/** Chuẩn hóa URI MongoDB cho Railway (authSource=admin + tên database). */
export function resolveMongoUri(config: ConfigService): string {
  let uri = config.get<string>('MONGODB_URI') ?? config.get<string>('MONGO_URL');
  if (!uri?.trim()) {
    throw new Error('MONGODB_URI hoặc MONGO_URL phải được cấu hình');
  }
  uri = uri.trim();

  const db = config.get<string>('MONGODB_DB', 'strangerconfide');
  const hasDbPath = /:\d+\/[^/?]+/.test(uri);
  if (!hasDbPath) {
    uri = `${uri.replace(/\/$/, '')}/${db}`;
  }

  if (!uri.includes('authSource=')) {
    uri += `${uri.includes('?') ? '&' : '?'}authSource=admin`;
  }

  return uri;
}
