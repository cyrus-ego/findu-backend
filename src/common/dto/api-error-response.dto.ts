import { ApiProperty } from '@nestjs/swagger';

export class FieldErrorDto {
  @ApiProperty({ example: 'email' })
  field: string;

  @ApiProperty({ example: 'Email không hợp lệ' })
  message: string;
}

/** Body lỗi từ HttpExceptionFilter — cùng shape với success response */
export class ApiErrorResponseDto {
  @ApiProperty({ example: false })
  success: false;

  @ApiProperty({ example: 401 })
  statusCode: number;

  @ApiProperty({ example: 'AUTH_UNAUTHORIZED', description: 'Mã lỗi machine-readable' })
  code: string;

  @ApiProperty({ example: 'Bạn cần đăng nhập để tiếp tục' })
  message: string;

  @ApiProperty({
    type: Object,
    nullable: true,
    description: 'Luôn null khi lỗi',
    example: null,
  })
  data: unknown;

  @ApiProperty({
    type: () => [FieldErrorDto],
    nullable: true,
    description: 'Danh sách lỗi field — chỉ có khi VALIDATION_ERROR',
    example: null,
  })
  errors: FieldErrorDto[] | null;

  @ApiProperty({
    type: Object,
    nullable: true,
    example: null,
  })
  meta: Record<string, unknown> | null;

  @ApiProperty({ example: 'req_8af2c1de9012ab34' })
  requestId: string;

  @ApiProperty({ example: '/api/profile' })
  path: string;

  @ApiProperty({ example: '2026-05-22T16:21:01.289Z', format: 'date-time' })
  timestamp: string;
}
