import { ApiProperty } from '@nestjs/swagger';

/** Response đơn giản chỉ có message */
export class MessageResponseDto {
  @ApiProperty({ example: 'OTP đã được gửi lại. Kiểm tra hộp thư của bạn.' })
  message: string;
}

export class ReportCreatedResponseDto {
  @ApiProperty({ example: 'Đã ghi nhận báo cáo. Cảm ơn bạn đã giúp cộng đồng an toàn hơn.' })
  message: string;

  @ApiProperty({ example: '665a1b2c3d4e5f6789012345' })
  reportId: string;
}
