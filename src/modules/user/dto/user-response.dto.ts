import { UserDocument } from '../entities/user.schema';

/** Dữ liệu user trả về client (không có password) */
export function toUserResponse(user: UserDocument) {
  return {
    id: String(user._id),
    email: user.email,
    displayName: user.displayName,
    avatar: user.avatar || '',
    role: user.role,
    provider: user.provider,
    isEmailVerified: user.isEmailVerified,
    createdAt: (user as any).createdAt,
    updatedAt: (user as any).updatedAt,
  };
}
