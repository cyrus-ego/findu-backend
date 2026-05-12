import { registerAs } from '@nestjs/config';

export default registerAs('jwt', () => ({
  secret: process.env.JWT_SECRET || 'fallback_secret',
  expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  refreshSecret: process.env.JWT_REFRESH_SECRET || 'fallback_refresh_secret',
  refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
}));
