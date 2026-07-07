#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${ENV_FILE:-.env.pod}"
IMAGE_NAME="${IMAGE_NAME:-findu-backend}"
IMAGE_TAG="${IMAGE_TAG:-local}"
APP_PORT="${APP_PORT:-3001}"
PORT="${PORT:-3000}"
SKIP_PROMPTS=0

usage() {
  cat <<EOF
Build and rerun the backend production Docker stack locally.
This uses docker-compose.prod.yml + docker-compose.local-prod.yml so MongoDB
and Redis run with the app, matching the VPS shape more closely.

Usage:
  scripts/rerun-image.sh [options]

Options:
  --env-file FILE          Env file. Default: ${ENV_FILE}
  --image IMAGE            Image name. Default: ${IMAGE_NAME}
  --tag TAG                Image tag. Default: ${IMAGE_TAG}
  --app-port PORT          Host/local port. Default: ${APP_PORT}
  --container-port PORT    Container app port. Default: ${PORT}
  -y, --yes                Use defaults/non-interactive values without prompts
  -h, --help               Show this help

Environment overrides:
  ENV_FILE, IMAGE_NAME, IMAGE_TAG, APP_PORT, PORT
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env-file)
      ENV_FILE="$2"
      shift 2
      ;;
    --image)
      IMAGE_NAME="$2"
      shift 2
      ;;
    --tag)
      IMAGE_TAG="$2"
      shift 2
      ;;
    --app-port | --local-port)
      APP_PORT="$2"
      shift 2
      ;;
    --container-port)
      PORT="$2"
      shift 2
      ;;
    -y | --yes)
      SKIP_PROMPTS=1
      shift
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

prompt_value() {
  local label="$1"
  local current="$2"
  local value

  if [[ "${SKIP_PROMPTS}" -eq 1 || ! -r /dev/tty ]]; then
    printf '%s' "${current}"
    return
  fi

  read -r -p "${label} [${current}]: " value </dev/tty
  printf '%s' "${value:-$current}"
}

APP_PORT="$(prompt_value "Local/host port" "${APP_PORT}")"
PORT="$(prompt_value "Container port" "${PORT}")"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Env file not found: ${ENV_FILE}" >&2
  exit 1
fi

echo "Env file: ${ENV_FILE}"
echo "Image: ${IMAGE_NAME}:${IMAGE_TAG}"
echo "Port mapping: ${APP_PORT}:${PORT}"

IMAGE_NAME="${IMAGE_NAME}" \
IMAGE_TAG="${IMAGE_TAG}" \
APP_PORT="${APP_PORT}" \
PORT="${PORT}" \
docker compose \
  -f docker-compose.prod.yml \
  -f docker-compose.local-prod.yml \
  --env-file "${ENV_FILE}" \
  up -d --build

echo "Backend stack started: http://localhost:${APP_PORT}"
