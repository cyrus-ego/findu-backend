import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { generateKeyPairSync, sign } from 'crypto';
import { AuthService } from './auth.service';
import { FacebookTokenType } from './dto/facebook-auth.dto';

describe('AuthService Facebook login', () => {
  const originalFetch = global.fetch;
  const configValues: Record<string, string> = {
    FACEBOOK_APP_ID: 'facebook-app-id',
    FACEBOOK_APP_SECRET: 'facebook-app-secret',
  };

  let service: AuthService;

  beforeEach(() => {
    const config = {
      get: jest.fn((key: string, fallback?: string) => configValues[key] ?? fallback),
    };

    service = new AuthService({} as any, {} as any, config as any, {} as any, {} as any);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('verifies a classic access token and maps the Facebook account', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ data: { app_id: 'facebook-app-id', is_valid: true, type: 'USER' } }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'facebook-user-id',
          name: 'Facebook User',
          email: 'facebook@example.com',
          picture: { data: { url: 'https://example.com/avatar.jpg' } },
        }),
      ) as any;
    const oauthLogin = jest.spyOn(service, 'oauthLogin').mockResolvedValue({ ok: true } as any);

    await expect(
      service.facebookLoginWithToken('classic-token', FacebookTokenType.CLASSIC),
    ).resolves.toEqual({ ok: true });

    expect(oauthLogin).toHaveBeenCalledWith({
      email: 'facebook@example.com',
      name: 'Facebook User',
      avatar: 'https://example.com/avatar.jpg',
      provider: 'facebook',
      providerId: 'facebook-user-id',
    });
  });

  it('rejects a classic token issued for another Facebook app', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        jsonResponse({ data: { app_id: 'another-app-id', is_valid: true, type: 'USER' } }),
      ) as any;

    await expect(
      service.facebookLoginWithToken('classic-token', FacebookTokenType.CLASSIC),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('verifies a signed Limited Login token, audience and nonce', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const kid = 'facebook-test-key';
    const now = Math.floor(Date.now() / 1000);
    const token = createJwt(
      { alg: 'RS256', kid },
      {
        iss: 'https://www.facebook.com',
        aud: 'facebook-app-id',
        sub: 'limited-facebook-user-id',
        iat: now - 5,
        exp: now + 300,
        nonce: 'single-use-nonce',
        name: 'Limited User',
        email: 'limited@example.com',
      },
      privateKey,
    );

    global.fetch = jest.fn().mockResolvedValue(
      jsonResponse({
        keys: [{ ...(publicKey.export({ format: 'jwk' }) as object), kid, alg: 'RS256' }],
      }),
    ) as any;
    const oauthLogin = jest.spyOn(service, 'oauthLogin').mockResolvedValue({ ok: true } as any);

    await expect(
      service.facebookLoginWithToken(token, FacebookTokenType.LIMITED, 'single-use-nonce'),
    ).resolves.toEqual({ ok: true });

    expect(oauthLogin).toHaveBeenCalledWith({
      email: 'limited@example.com',
      name: 'Limited User',
      avatar: undefined,
      provider: 'facebook',
      providerId: 'limited-facebook-user-id',
    });
  });

  it('requires a nonce for Limited Login', async () => {
    await expect(
      service.facebookLoginWithToken('limited-token', FacebookTokenType.LIMITED),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

function jsonResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

function createJwt(
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
  privateKey: ReturnType<typeof generateKeyPairSync>['privateKey'],
): string {
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = sign('RSA-SHA256', Buffer.from(signingInput), privateKey).toString('base64url');
  return `${signingInput}.${signature}`;
}
