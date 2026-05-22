import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiCode } from '../constants/api-code.enum';
import { AppException, FieldError } from '../exceptions/app.exception';
import { getRequestId } from '../middleware/request-id.middleware';
import { ApiResponse } from '../interceptors/transform.interceptor';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { statusCode, code, message, errors } = this.normalize(exception);
    const requestId = getRequestId(request);
    const path = request.originalUrl || request.url;

    this.logger.error(
      `[${request.method}] ${path} → ${statusCode} ${code}: ${JSON.stringify(message)} (reqId=${requestId})`,
    );

    const body: ApiResponse<null> = {
      success: false,
      statusCode,
      code,
      message,
      data: null,
      errors: errors ?? null,
      meta: null,
      requestId,
      path,
      timestamp: new Date().toISOString(),
    };

    response.status(statusCode).json(body);
  }

  private normalize(exception: unknown): {
    statusCode: number;
    code: string;
    message: string;
    errors: FieldError[] | null;
  } {
    // Lỗi nội bộ chuẩn — đã có code/message rõ
    if (exception instanceof AppException) {
      const res = exception.getResponse() as { message?: string; errors?: FieldError[] };
      return {
        statusCode: exception.getStatus(),
        code: exception.code,
        message: typeof res?.message === 'string' ? res.message : exception.message,
        errors: exception.fieldErrors ?? null,
      };
    }

    // HttpException thường (ValidationPipe, AuthGuard, ...)
    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const res = exception.getResponse();
      const raw = typeof res === 'object' && res !== null ? (res as Record<string, unknown>) : {};

      const rawMessage = (raw.message ?? exception.message) as string | string[];
      const fallbackCode = mapHttpStatusToCode(statusCode);

      // ValidationPipe: message là string[] → tách thành errors[]
      if (Array.isArray(rawMessage)) {
        const errors = rawMessage.map<FieldError>((m) => parseValidationMessage(m));
        return {
          statusCode,
          code: typeof raw.code === 'string' ? raw.code : ApiCode.VALIDATION_ERROR,
          message: 'Dữ liệu không hợp lệ',
          errors,
        };
      }

      return {
        statusCode,
        code: typeof raw.code === 'string' ? raw.code : fallbackCode,
        message: rawMessage || mapHttpStatusToMessage(statusCode),
        errors: null,
      };
    }

    // Lỗi không xác định
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: ApiCode.INTERNAL_ERROR,
      message: 'Lỗi máy chủ. Vui lòng thử lại sau.',
      errors: null,
    };
  }
}

/** Map HTTP status → ApiCode mặc định khi exception không gắn `code` */
function mapHttpStatusToCode(status: number): string {
  switch (status) {
    case HttpStatus.UNAUTHORIZED:
      return ApiCode.AUTH_UNAUTHORIZED;
    case HttpStatus.FORBIDDEN:
      return ApiCode.FORBIDDEN;
    case HttpStatus.NOT_FOUND:
      return ApiCode.NOT_FOUND;
    case HttpStatus.TOO_MANY_REQUESTS:
      return ApiCode.RATE_LIMITED;
    case HttpStatus.BAD_REQUEST:
      return ApiCode.VALIDATION_ERROR;
    case HttpStatus.INTERNAL_SERVER_ERROR:
      return ApiCode.INTERNAL_ERROR;
    default:
      return `HTTP_${status}`;
  }
}

function mapHttpStatusToMessage(status: number): string {
  switch (status) {
    case HttpStatus.UNAUTHORIZED:
      return 'Bạn cần đăng nhập để tiếp tục';
    case HttpStatus.FORBIDDEN:
      return 'Bạn không có quyền thực hiện hành động này';
    case HttpStatus.NOT_FOUND:
      return 'Không tìm thấy tài nguyên';
    case HttpStatus.TOO_MANY_REQUESTS:
      return 'Quá nhiều yêu cầu. Hãy thử lại sau.';
    default:
      return 'Có lỗi xảy ra';
  }
}

/**
 * Heuristic tách field từ message class-validator dạng:
 *   "email must be an email"
 *   "password phải có ít nhất 6 ký tự"
 * Không hoàn hảo 100% nhưng đủ để mobile hiển thị lỗi từng field.
 */
function parseValidationMessage(msg: string): FieldError {
  const trimmed = msg.trim();
  const parts = trimmed.split(/\s+/);
  const candidate = parts[0];

  // Field thường là chữ thường, không dấu cách
  if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(candidate)) {
    return { field: candidate, message: trimmed };
  }
  return { field: '_', message: trimmed };
}
