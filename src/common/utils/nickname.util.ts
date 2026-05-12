/**
 * Tạo nickname ẩn danh ngẫu nhiên cho phòng chat
 * Ví dụ: Stranger#7482, Wanderer#1234
 */
const PREFIXES = ['Stranger', 'Wanderer', 'Phantom', 'Shadow', 'Ghost', 'Mystic', 'Echo'];

export function generateAnonymousNickname(): string {
  const prefix = PREFIXES[Math.floor(Math.random() * PREFIXES.length)];
  const number = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}#${number}`;
}

export function generateAnonymousAvatar(seed: string): string {
  // Dùng DiceBear API để tạo avatar ngẫu nhiên
  return `https://api.dicebear.com/7.x/bottts/svg?seed=${seed}`;
}
