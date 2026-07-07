#!/usr/bin/env bash
set -euo pipefail

IMAGE_NAME="${IMAGE_NAME:-ghcr.io/cyrus-ego/findu-backend}"
TAG_SHA="${TAG_SHA:-$(git rev-parse HEAD)}"

usage() {
  cat <<EOF
Push the backend Docker image that was built locally.

Usage:
  scripts/docker-push.sh [options]

Options:
  --image IMAGE             Image name. Default: ${IMAGE_NAME}
  --tag TAG                 Commit tag. Default: current git HEAD
  -h, --help                Show this help

Environment overrides:
  IMAGE_NAME, TAG_SHA
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --image)
      IMAGE_NAME="$2"
      shift 2
      ;;
    --tag)
      TAG_SHA="$2"
      shift 2
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

echo "Pushing ${IMAGE_NAME}:latest"
docker push "${IMAGE_NAME}:latest"

echo "Pushing ${IMAGE_NAME}:${TAG_SHA}"
docker push "${IMAGE_NAME}:${TAG_SHA}"
