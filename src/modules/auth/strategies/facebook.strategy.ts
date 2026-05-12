import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-facebook';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class FacebookStrategy extends PassportStrategy(Strategy, 'facebook') {
  constructor(private readonly config: ConfigService) {
    super({
      clientID: config.get<string>('FACEBOOK_APP_ID'),
      clientSecret: config.get<string>('FACEBOOK_APP_SECRET'),
      callbackURL: config.get<string>('FACEBOOK_CALLBACK_URL'),
      profileFields: ['id', 'displayName', 'emails', 'photos'],
    });
  }

  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: any,
    done: (err: any, user?: any) => void,
  ) {
    const { displayName, emails, photos } = profile;
    const user = {
      email: emails?.[0]?.value || `fb_${profile.id}@strangerconfide.local`,
      name: displayName,
      avatar: photos?.[0]?.value,
      provider: 'facebook',
    };
    done(null, user);
  }
}
