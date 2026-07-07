# FindU Docker Workflow

## 1. Dev local

Chạy app trực tiếp bằng Nest:

```bash
npm run start:dev
```

App sẽ đọc `.env.dev` trước, fallback về `.env` nếu cần.

Chạy cả stack bằng Docker:

```bash
npm run docker:dev:up
```

Compose dev vẫn dùng `.env.dev`, nhưng override `MONGODB_URI` và `REDIS_HOST` sang service name nội bộ Docker (`mongo`, `redis`).

## 2. Test production image trên máy local

Điền secret/domain thật hoặc staging vào `.env.pod`, rồi chạy:

```bash
npm run rerun_image
```

Script này dùng `docker-compose.prod.yml` kèm `docker-compose.local-prod.yml`, build image local và chạy app cùng MongoDB/Redis bằng cấu hình production.

Nếu muốn chạy không hỏi port:

```bash
npm run rerun_image -- -y
```

## 3. Option 1: push image từ local lên GHCR

Đăng nhập GHCR:

```bash
echo "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USER" --password-stdin
```

Build và push:

```bash
TAG_SHA=sha-local-001 npm run docker:publish
```

Nếu muốn build local trước, rồi push sau:

```bash
TAG_SHA=sha-local-001 npm run docker:build
TAG_SHA=sha-local-001 npm run docker:push
```

Trên VPS:

```bash
cd ~/dev/findu-backend
export IMAGE_TAG=sha-local-001
npm run docker:prod:pull
npm run docker:prod:up
```

Nếu không có `package.json` trên VPS, dùng trực tiếp:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.pod pull app
docker compose -f docker-compose.prod.yml --env-file .env.pod up -d
```

## 4. Option 2: push code lên GitHub để Actions build và deploy

Workflow `.github/workflows/docker-build-push.yml` sẽ:

1. Build image.
2. Push image lên GHCR.
3. SSH vào VPS.
4. Pull image mới và restart stack.

Secrets/variables cần cấu hình trong GitHub:

- `VPS_HOST` hoặc variable `VPS_HOST`
- `VPS_USER` hoặc variable `VPS_USER`
- `VPS_SSH_KEY`
- `GHCR_TOKEN` nếu package private
- `PROD_ENV_FILE`: nội dung đầy đủ của file `.env.pod`

Nếu không set `PROD_ENV_FILE`, VPS phải có sẵn file `~/dev/findu-backend/.env.pod`.
