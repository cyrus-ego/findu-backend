import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export enum ReportReason {
  SPAM = 'spam',
  HARASSMENT = 'harassment',
  INAPPROPRIATE_CONTENT = 'inappropriate_content',
  PERSONAL_INFO = 'personal_info',
  OTHER = 'other',
}

export class ReportDto {
  @IsString()
  reportedUserId: string;

  @IsString()
  roomId: string;

  @IsEnum(ReportReason)
  reason: ReportReason;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
