import { HttpStatus } from '@nestjs/common';
import { ApiCode } from '../constants/api-code.enum';
import { AppException } from './app.exception';

export class ProfileNotFoundException extends AppException {
  constructor() {
    super(
      { code: ApiCode.PROFILE_NOT_FOUND, message: 'Chưa có hồ sơ. Vui lòng tạo hồ sơ trước.' },
      HttpStatus.NOT_FOUND,
    );
  }
}

export class ProfileAlreadyExistsException extends AppException {
  constructor() {
    super(
      {
        code: ApiCode.PROFILE_ALREADY_EXISTS,
        message: 'Hồ sơ đã tồn tại. Dùng PUT hoặc PATCH để cập nhật.',
      },
      HttpStatus.CONFLICT,
    );
  }
}
