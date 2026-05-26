import { HttpStatus } from '@nestjs/common';
import { ApiCode } from '../constants/api-code.enum';
import { AppException } from './app.exception';

export class ProfileIncompleteException extends AppException {
  constructor() {
    super(
      {
        code: ApiCode.PROFILE_INCOMPLETE,
        message: 'Hồ sơ chưa hoàn thiện. Vui lòng cập nhật giới tính và tuổi trước khi tìm người tâm sự.',
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}

export class NotInQueueException extends AppException {
  constructor() {
    super(
      { code: ApiCode.NOT_FOUND, message: 'Bạn không có trong hàng đợi' },
      HttpStatus.NOT_FOUND,
    );
  }
}

export class QueueTimeoutException extends AppException {
  constructor() {
    super(
      { code: ApiCode.MATCHMAKING_TIMEOUT, message: 'Hết thời gian chờ (5 phút). Vui lòng thử lại.' },
      HttpStatus.REQUEST_TIMEOUT,
    );
  }
}
