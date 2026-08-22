/**
 * Tạo bí danh ngẫu nhiên cho cuộc trò chuyện.
 * Ví dụ: Member#7482, Listener#1234
 */
const PREFIXES = [
  'Member',
  'Listener',
  'Speaker',
  'Companion',
  'Neighbor',
  'Friend',
  'Voice',
];

export function generateAnonymousNickname(): string {
  const prefix = PREFIXES[Math.floor(Math.random() * PREFIXES.length)];
  const number = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}#${number}`;
}

export function generateAnonymousAvatar(seed: string): string {
  // Dùng DiceBear API để tạo avatar ngẫu nhiên
  return `https://api.dicebear.com/7.x/bottts/svg?seed=${seed}`;
}
