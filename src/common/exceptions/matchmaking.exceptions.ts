import { HttpException, HttpStatus } from '@nestjs/common';

export class ProfileIncompleteException extends HttpException {
  constructor() {
    super(
      'Hồ sơ chưa hoàn thiện. Vui lòng cập nhật giới tính và tuổi trước khi tìm người tâm sự.',
      HttpStatus.BAD_REQUEST,
    );
  }
}

export class NotInQueueException extends HttpException {
  constructor() {
    super('Bạn không có trong hàng đợi', HttpStatus.NOT_FOUND);
  }
}

export class QueueTimeoutException extends HttpException {
  constructor() {
    super('Hết thời gian chờ (5 phút). Vui lòng thử lại.', HttpStatus.REQUEST_TIMEOUT);
  }
}
