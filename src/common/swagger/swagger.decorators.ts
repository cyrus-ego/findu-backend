import { applyDecorators, Type } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
  getSchemaPath,
} from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../dto/api-error-response.dto';

type HttpOkStatus = 200 | 201;

/**
 * Mô tả response thực tế sau TransformInterceptor.
 * Body luôn theo shape: success, statusCode, code, message, data, errors, meta,
 *                      requestId, path, timestamp.
 */
export function ApiSuccessResponse<TModel extends Type>(
  model: TModel,
  options?: { status?: HttpOkStatus; description?: string; code?: string; message?: string },
) {
  const status = options?.status ?? 200;
  const isCreated = status === 201;
  const description = options?.description ?? 'Phản hồi thành công';
  const codeExample = options?.code ?? (isCreated ? 'CREATED' : 'OK');
  const messageExample = options?.message ?? (isCreated ? 'Tạo mới thành công' : 'Thành công');

  const schema = {
    required: [
      'success',
      'statusCode',
      'code',
      'message',
      'data',
      'errors',
      'meta',
      'requestId',
      'path',
      'timestamp',
    ],
    properties: {
      success: { type: 'boolean', example: true },
      statusCode: { type: 'number', example: status },
      code: { type: 'string', example: codeExample },
      message: { type: 'string', example: messageExample },
      data: { $ref: getSchemaPath(model) },
      errors: { type: 'array', items: { type: 'object' }, nullable: true, example: null },
      meta: { type: 'object', nullable: true, example: null },
      requestId: { type: 'string', example: 'req_8af2c1de9012ab34' },
      path: { type: 'string', example: '/api/example' },
      timestamp: { type: 'string', format: 'date-time', example: '2026-05-22T16:21:01.289Z' },
    },
  };

  const responseDecorator = isCreated
    ? ApiCreatedResponse({ description, schema })
    : ApiOkResponse({ description, schema });

  return applyDecorators(ApiExtraModels(model), responseDecorator);
}

/** Lỗi phổ biến: 400, 401, 403, 404, 429 */
export function ApiStandardErrors() {
  return applyDecorators(
    ApiExtraModels(ApiErrorResponseDto),
    ApiBadRequestResponse({ type: ApiErrorResponseDto, description: 'Dữ liệu không hợp lệ' }),
    ApiUnauthorizedResponse({ type: ApiErrorResponseDto, description: 'Chưa xác thực' }),
    ApiForbiddenResponse({ type: ApiErrorResponseDto, description: 'Không có quyền' }),
    ApiNotFoundResponse({ type: ApiErrorResponseDto, description: 'Không tìm thấy' }),
    ApiTooManyRequestsResponse({ type: ApiErrorResponseDto, description: 'Quá nhiều yêu cầu' }),
  );
}
