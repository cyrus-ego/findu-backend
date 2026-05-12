import { HttpException, HttpStatus } from '@nestjs/common';

export class UserNotFoundException extends HttpException {
  constructor() {
    super('Người dùng không tồn tại', HttpStatus.NOT_FOUND);
  }
}

export class InvalidCredentialsException extends HttpException {
  constructor() {
    super('Email hoặc mật khẩu không đúng', HttpStatus.UNAUTHORIZED);
  }
}

export class EmailAlreadyExistsException extends HttpException {
  constructor() {
    super('Email này đã được sử dụng', HttpStatus.CONFLICT);
  }
}

export class RoomNotFoundException extends HttpException {
  constructor() {
    super('Phòng chat không tồn tại hoặc đã đóng', HttpStatus.NOT_FOUND);
  }
}

export class UserBlockedException extends HttpException {
  constructor() {
    super('Không thể thực hiện hành động với người dùng này', HttpStatus.FORBIDDEN);
  }
}

export class AlreadyInQueueException extends HttpException {
  constructor() {
    super('Bạn đang trong hàng đợi ghép đôi', HttpStatus.CONFLICT);
  }
}
