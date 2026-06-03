# Socket.IO Reconnect Handling — Frontend Guide

## Problem

Khi user treo browser tab ở phòng chat quá lâu:
1. Chrome/Chromium suspend network I/O cho background tab
2. WebSocket connection bị drop
3. Socket.IO cố reconnect nhưng `sid` cũ đã hết hạn → server trả 400
4. Sau nhiều lần retry, client reconnect được nhưng **không tự động vào lại room**
5. User không nhận được tin nhắn real-time từ đối phương

## Server-side đã fix

- `handleConnection()` tự động tìm phòng đang active và join socket vào
- `connectionStateRecovery` (2 phút) cho tab switch ngắn

Tuy nhiên **frontend vẫn cần chủ động handle reconnect** để đảm bảo mọi thứ hoạt động đúng.

---

## Frontend Actions Required

### 1. Socket.IO Client Config

```typescript
const socket = io('wss://<your-domain>', {
  transports: ['websocket'],                // Chỉ WebSocket — bỏ polling
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,                  // Bắt đầu 1s
  reconnectionDelayMax: 5000,               // Tối đa 5s
  randomizationFactor: 0.5,
});
```

> **Important**: Nếu dùng polling, reconnect sẽ chậm hơn do phải làm HTTP handshake lại. `transports: ['websocket']` giúp reconnect nhanh và ổn định hơn.

### 2. Re-emit `room:join` sau mỗi lần `connect`

Đây là quan trọng nhất. Lưu `activeRoomId` (từ cookie `active-room-id`) và emit lại `room:join` mỗi khi socket reconnect:

```typescript
let activeRoomId: string | null = null;

// Đọc từ cookie khi app khởi tạo
function getActiveRoomId(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)active-room-id=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function clearActiveRoomId() {
  document.cookie = 'active-room-id=; path=/; max-age=0';
}

// Socket events
socket.on('connect', () => {
  activeRoomId = getActiveRoomId();
  if (activeRoomId) {
    socket.emit('room:join', { roomId: activeRoomId });
  }
});

socket.on('room:joined', (data) => {
  // Set lại cookie (phòng hợp lệ)
  document.cookie = `active-room-id=${data.session.roomId}; path=/; max-age=86400`;
  activeRoomId = data.session.roomId;
});
```

**Lưu ý quan trọng**:
- `room:join` fetch lại **lịch sử tin nhắn** (`messages`) và **session info**
- Nếu không emit `room:join` sau reconnect, user sẽ không có history và session
- Server đã auto-join socket vào room ở `handleConnection`, nhưng chỉ để nhận real-time messages — history vẫn cần `room:join` từ client

### 3. Handle `room:access_denied` — Xóa cookie nếu phòng đã đóng

```typescript
socket.on('room:access_denied', (data) => {
  clearActiveRoomId();
  activeRoomId = null;
  // Redirect về trang matchmaking
  window.location.href = '/';
});
```

### 4. Handle `room:closed` — Dọn dẹp khi đối phương rời phòng

```typescript
socket.on('room:closed', (data) => {
  clearActiveRoomId();
  activeRoomId = null;
  // Redirect về trang matchmaking
  window.location.href = '/';
});
```

### 5. Detect user quay lại tab — Visibility API

Khi user quay lại tab sau khi idle, force socket reconnect ngay:

```typescript
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && socket?.disconnected) {
    socket.connect();
  }
});
```

### 6. Handle `disconnect` — UI feedback

```typescript
socket.on('disconnect', (reason) => {
  if (reason === 'io client disconnect') return; // intentional

  // Hiển thị indicator "Đang kết nối lại..." trong chat UI
  showReconnectingIndicator(true);
});

socket.on('connect', () => {
  showReconnectingIndicator(false);
});
```

---

## Flow tổng thể sau fix

```
Browser tab idle → network suspend → WebSocket mất
         ↓
User quay lại tab → visibilitychange
         ↓
Socket.IO reconnect (tự động hoặc manual)
  ├── Server: handleConnection() → auto-join room
  └── Client:  connect event → emit('room:join', { roomId })
         ↓
Server: handleJoinRoom() → trả về messages + session
         ↓
Chat UI hoạt động bình thường
```

## Checklist cho frontend agent

- [ ] Config Socket.IO client với `transports: ['websocket']`
- [ ] Lưu `activeRoomId` từ cookie, emit `room:join` trong `connect` event
- [ ] Xóa cookie khi nhận `room:access_denied` hoặc `room:closed`
- [ ] Thêm `visibilitychange` listener để force reconnect
- [ ] Thêm UI indicator "Đang kết nối lại..." khi socket disconnected
- [ ] Test: treo tab 5-10 phút, quay lại → chat vẫn hoạt động
