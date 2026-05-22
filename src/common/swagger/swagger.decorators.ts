import { applyDecorators, Type } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiUnauthorizedResponse,
  getSchemaPath,
} from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../dto/api-error-response.dto';

type HttpOkStatus = 200 | 201;

/**
 * Mô tả response thực tế sau TransformInterceptor:
 * { success: true, data: T, timestamp: string }
 */
export function ApiSuccessResponse<TModel extends Type>(
  model: TModel,
  options?: { status?: HttpOkStatus; description?: string },
) {
  const status = options?.status ?? 200;
  const description =
    options?.description ?? 'Thành công — body bọc bởi { success, data, timestamp }';

  const schema = {
    required: ['success', 'data', 'timestamp'],
    properties: {
      success: { type: 'boolean', example: true },
      data: { $ref: getSchemaPath(model) },
      timestamp: {
        type: 'string',
        format: 'date-time',
        example: '2026-05-22T16:21:01.289Z',
      },
    },
  };

  const responseDecorator =
    status === 201
      ? ApiCreatedResponse({ description, schema })
      : ApiOkResponse({ description, schema });

  return applyDecorators(ApiExtraModels(model, ApiErrorResponseDto), responseDecorator);
}

/** Lỗi phổ biến: 400, 401, 403, 404 */
export function ApiStandardErrors() {
  return applyDecorators(
    ApiExtraModels(ApiErrorResponseDto),
    ApiBadRequestResponse({ type: ApiErrorResponseDto }),
    ApiUnauthorizedResponse({ type: ApiErrorResponseDto }),
    ApiForbiddenResponse({ type: ApiErrorResponseDto }),
    ApiNotFoundResponse({ type: ApiErrorResponseDto }),
  );
}
