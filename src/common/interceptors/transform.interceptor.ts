import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  HttpStatus,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Request, Response } from 'express';
import { ApiCode } from '../constants/api-code.enum';
import { getRequestId } from '../middleware/request-id.middleware';
import { FieldError } from '../exceptions/app.exception';

/** Shape response thống nhất cho mọi REST API */
export interface ApiResponse<T> {
  success: boolean;
  statusCode: number;
  code: string;
  message: string;
  data: T | null;
  errors: FieldError[] | null;
  meta: Record<string, unknown> | null;
  requestId: string;
  path: string;
  timestamp: string;
}

/**
 * Khi controller muốn ghi đè message/code/meta:
 *   return { __api: { code: ApiCode.CREATED, message: '...', meta: {...} }, payload };
 * Interceptor sẽ tách `__api` ra và đặt vào envelope.
 */
export interface ControllerEnvelope<T> {
  __api?: { code?: ApiCode; message?: string; meta?: Record<string, unknown> };
  payload: T;
}

const DEFAULT_OK_MESSAGE = 'Thành công';
const DEFAULT_CREATED_MESSAGE = 'Tạo mới thành công';

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<ApiResponse<T>> {
    const ctx = context.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();

    return next.handle().pipe(
      map((raw) => {
        const statusCode = res.statusCode || HttpStatus.OK;
        const envelope = extractEnvelope(raw);
        const isCreated = statusCode === HttpStatus.CREATED;

        return {
          success: true,
          statusCode,
          code: envelope.code ?? (isCreated ? ApiCode.CREATED : ApiCode.OK),
          message:
            envelope.message ?? (isCreated ? DEFAULT_CREATED_MESSAGE : DEFAULT_OK_MESSAGE),
          data: (envelope.data ?? null) as T | null,
          errors: null,
          meta: envelope.meta ?? null,
          requestId: getRequestId(req),
          path: req.originalUrl || req.url,
          timestamp: new Date().toISOString(),
        };
      }),
    );
  }
}

interface NormalizedEnvelope {
  code?: ApiCode;
  message?: string;
  meta?: Record<string, unknown> | null;
  data: unknown;
}

function extractEnvelope(raw: unknown): NormalizedEnvelope {
  if (raw && typeof raw === 'object' && '__api' in (raw as object)) {
    const { __api, payload } = raw as ControllerEnvelope<unknown>;
    return {
      code: __api?.code,
      message: __api?.message,
      meta: __api?.meta ?? null,
      data: payload,
    };
  }
  return { data: raw };
}
