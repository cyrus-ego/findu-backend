import { HttpException, HttpStatus } from '@nestjs/common';
import { ApiCode } from '../constants/api-code.enum';

export interface FieldError {
  field: string;
  message: string;
}

export interface AppExceptionPayload {
  /** Mã lỗi machine-readable cho client switch-case */
  code: ApiCode;
  /** Thông điệp human-readable (đã dịch sang tiếng Việt) */
  message: string;
  /** Danh sách lỗi từng field — dùng cho validation form */
  errors?: FieldError[];
}

/**
 * Exception nội bộ chuẩn của StrangerConfide.
 * Mọi HttpExceptionFilter sẽ đọc `code`/`errors` từ đây để tạo response.
 */
export class AppException extends HttpException {
  readonly code: ApiCode;
  readonly fieldErrors?: FieldError[];

  constructor(payload: AppExceptionPayload, status: HttpStatus) {
    super(
      {
        statusCode: status,
        code: payload.code,
        message: payload.message,
        errors: payload.errors ?? null,
      },
      status,
    );
    this.code = payload.code;
    this.fieldErrors = payload.errors;
  }
}
