import { HttpException, HttpStatus } from '@nestjs/common';

export class ProfileNotFoundException extends HttpException {
  constructor() {
    super('Chưa có hồ sơ. Vui lòng tạo hồ sơ trước.', HttpStatus.NOT_FOUND);
  }
}

export class ProfileAlreadyExistsException extends HttpException {
  constructor() {
    super('Hồ sơ đã tồn tại. Dùng PUT hoặc PATCH để cập nhật.', HttpStatus.CONFLICT);
  }
}
