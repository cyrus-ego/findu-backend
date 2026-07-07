#!/usr/bin/env bash
set -euo pipefail

IMAGE_NAME="${IMAGE_NAME:-ghcr.io/cyrus-ego/findu-backend}"
PLATFORM="${PLATFORM:-linux/arm64}"
TAG_SHA="${TAG_SHA:-$(git rev-parse HEAD)}"
OUTPUT_MODE="--push"

usage() {
  cat <<EOF
Build and publish the backend Docker image.

Usage:
  scripts/docker-build-push.sh [options]

Options:
  --image IMAGE             Image name. Default: ${IMAGE_NAME}
  --platform PLATFORM       Docker target platform. Default: ${PLATFORM}
  --tag TAG                 Commit tag. Default: current git HEAD
  --load                    Load image into local Docker instead of pushing
  -h, --help                Show this help

Environment overrides:
  IMAGE_NAME, PLATFORM, TAG_SHA
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --image)
      IMAGE_NAME="$2"
      shift 2
      ;;
    --platform)
      PLATFORM="$2"
      shift 2
      ;;
    --tag)
      TAG_SHA="$2"
      shift 2
      ;;
    --load | --no-push)
      OUTPUT_MODE="--load"
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

echo "Building ${IMAGE_NAME}:latest"
echo "Building ${IMAGE_NAME}:${TAG_SHA}"
echo "Platform: ${PLATFORM}"
echo "Output: ${OUTPUT_MODE}"

docker build \
  --platform "${PLATFORM}" \
  -t "${IMAGE_NAME}:latest" \
  -t "${IMAGE_NAME}:${TAG_SHA}" \
  "${OUTPUT_MODE}" \
  .
