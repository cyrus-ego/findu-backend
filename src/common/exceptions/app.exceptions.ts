import { HttpStatus } from '@nestjs/common';
import { ApiCode } from '../constants/api-code.enum';
import { AppException } from './app.exception';

export class UserNotFoundException extends AppException {
  constructor() {
    super(
      { code: ApiCode.USER_NOT_FOUND, message: 'Người dùng không tồn tại' },
      HttpStatus.NOT_FOUND,
    );
  }
}

export class InvalidCredentialsException extends AppException {
  constructor() {
    super(
      { code: ApiCode.AUTH_INVALID_CREDENTIALS, message: 'Email hoặc mật khẩu không đúng' },
      HttpStatus.UNAUTHORIZED,
    );
  }
}

export class EmailAlreadyExistsException extends AppException {
  constructor() {
    super(
      { code: ApiCode.AUTH_EMAIL_EXISTS, message: 'Email này đã được sử dụng' },
      HttpStatus.CONFLICT,
    );
  }
}

export class RoomNotFoundException extends AppException {
  constructor() {
    super(
      { code: ApiCode.ROOM_NOT_FOUND, message: 'Phòng chat không tồn tại hoặc đã đóng' },
      HttpStatus.NOT_FOUND,
    );
  }
}

export class UserBlockedException extends AppException {
  constructor() {
    super(
      {
        code: ApiCode.CHAT_BLOCKED_BY_USER,
        message: 'Không thể thực hiện hành động với người dùng này',
      },
      HttpStatus.FORBIDDEN,
    );
  }
}

export class AlreadyInQueueException extends AppException {
  constructor() {
    super(
      { code: ApiCode.MATCHMAKING_ALREADY_IN_QUEUE, message: 'Bạn đang trong hàng đợi ghép đôi' },
      HttpStatus.CONFLICT,
    );
  }
}
