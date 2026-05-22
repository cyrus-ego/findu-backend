import { ApiProperty } from '@nestjs/swagger';

/** Body lỗi từ HttpExceptionFilter */
export class ApiErrorResponseDto {
  @ApiProperty({ example: false, description: 'Luôn false khi lỗi' })
  success: boolean;

  @ApiProperty({ example: 401, description: 'HTTP status code' })
  statusCode: number;

  @ApiProperty({
    example: 'Bạn cần đăng nhập để tiếp tục',
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
  })
  message: string | string[];

  @ApiProperty({ example: '2026-05-22T16:21:01.289Z', format: 'date-time' })
  timestamp: string;

  @ApiProperty({ example: '/api/profile' })
  path: string;
}
