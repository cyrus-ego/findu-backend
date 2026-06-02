import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleStrategy } from './strategies/google.strategy';
import { FacebookStrategy } from './strategies/facebook.strategy';

/** Bỏ qua OAuth provider khi chưa cấu hình (deploy Railway không bắt buộc Facebook). */
export function isOAuthClientConfigured(clientId?: string): boolean {
  if (!clientId?.trim()) return false;
  const normalized = clientId.trim().toLowerCase();
  return normalized !== 'placeholder' && normalized !== 'changeme';
}

export function createOptionalOAuthProviders(): Provider[] {
  return [
    {
      provide: GoogleStrategy,
      useFactory: (config: ConfigService) => {
        if (!isOAuthClientConfigured(config.get<string>('GOOGLE_CLIENT_ID'))) {
          return null;
        }
        return new GoogleStrategy(config);
      },
      inject: [ConfigService],
    },
    {
      provide: FacebookStrategy,
      useFactory: (config: ConfigService) => {
        if (!isOAuthClientConfigured(config.get<string>('FACEBOOK_APP_ID'))) {
          return null;
        }
        return new FacebookStrategy(config);
      },
      inject: [ConfigService],
    },
  ];
}
