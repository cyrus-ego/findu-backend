import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

const HEADER = 'x-request-id';

/**
 * Sinh hoặc nhận request-id từ client để log + trả lại trong response.
 * Mobile gửi `X-Request-Id` từ phía client → server tôn trọng giá trị đó.
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const incoming = req.headers[HEADER];
    const id =
      typeof incoming === 'string' && incoming.trim().length > 0
        ? incoming.trim()
        : `req_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

    (req as any).requestId = id;
    res.setHeader(HEADER, id);
    next();
  }
}

export function getRequestId(req: Request | undefined): string {
  return (req as any)?.requestId ?? 'req_unknown';
}
