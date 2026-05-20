import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { BadRequestException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';

const UPLOAD_DIR = join(process.cwd(), 'uploads', 'avatars');
const MAX_SIZE_MB = parseInt(process.env.MAX_FILE_SIZE_MB || '5', 10);
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

if (!existsSync(UPLOAD_DIR)) {
  mkdirSync(UPLOAD_DIR, { recursive: true });
}

export const avatarMulterOptions = {
  storage: diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, UPLOAD_DIR);
    },
    filename: (_req, file, cb) => {
      const ext = extname(file.originalname).toLowerCase() || '.jpg';
      cb(null, `${uuidv4()}${ext}`);
    },
  }),
  limits: { fileSize: MAX_SIZE_MB * 1024 * 1024 },
  fileFilter: (_req: any, file: Express.Multer.File, cb: (err: Error | null, accept: boolean) => void) => {
    if (!ALLOWED_MIME.includes(file.mimetype)) {
      cb(new BadRequestException('Chỉ chấp nhận ảnh JPEG, PNG, WebP hoặc GIF') as any, false);
      return;
    }
    cb(null, true);
  },
};

export const AVATAR_UPLOAD_DIR = UPLOAD_DIR;
