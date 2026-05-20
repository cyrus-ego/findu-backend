import { ProfileDocument } from '../entities/profile.schema';
import { UserDocument } from '../../user/entities/user.schema';

export interface ProfileResponse {
  user: {
    id: string;
    email: string;
    displayName: string;
    avatar: string;
    role: string;
    isEmailVerified: boolean;
  };
  profile: {
    id: string;
    gender: string;
    age: number;
    bio: string;
    avatar: string;
    chatPreference: string;
    preferredGender?: string;
    isVip: boolean;
    vipExpiresAt?: Date | null;
    createdAt?: Date;
    updatedAt?: Date;
  } | null;
  /** Đủ gender + age để vào matchmaking */
  isComplete: boolean;
}

export function toProfileResponse(
  user: UserDocument,
  profile: ProfileDocument | null,
): ProfileResponse {
  const avatar = profile?.avatar || user.avatar || '';

  return {
    user: {
      id: String(user._id),
      email: user.email,
      displayName: user.displayName,
      avatar,
      role: user.role,
      isEmailVerified: user.isEmailVerified,
    },
    profile: profile
      ? {
          id: String(profile._id),
          gender: profile.gender,
          age: profile.age,
          bio: profile.bio || '',
          avatar: profile.avatar || user.avatar || '',
          chatPreference: profile.chatPreference,
          preferredGender: profile.preferredGender,
          isVip: profile.isVip,
          vipExpiresAt: profile.vipExpiresAt,
          createdAt: (profile as any).createdAt,
          updatedAt: (profile as any).updatedAt,
        }
      : null,
    isComplete: !!(profile?.gender && profile?.age),
  };
}
