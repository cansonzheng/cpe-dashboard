#!/usr/bin/env bash
set -euo pipefail

DEPLOY_HOST='192.168.20.1'
DEPLOY_USER='root'
DEPLOY_PASSWORD='@@@@####....'
DEPLOY_CONTAINER='cpe-dashboard'
DEPLOY_DIRECTORY='/docker/cpe-dashboard'

PROJECT_DIRECTORY="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIRECTORY"

for dependency in sshpass rsync ssh; do
  if ! command -v "$dependency" >/dev/null 2>&1; then
    printf '缺少部署依赖：%s，请先安装后重试。\n' "$dependency" >&2
    exit 1
  fi
done

if [[ ! -f dist/public/index.html || ! -f dist/server/index.mjs ]]; then
  printf '构建产物不完整，请先运行 pnpm build。\n' >&2
  exit 1
fi

if [[ ! "$DEPLOY_CONTAINER" =~ ^[a-zA-Z0-9][a-zA-Z0-9_.-]*$ ]]; then
  printf '容器名称无效。\n' >&2
  exit 1
fi

export SSHPASS="$DEPLOY_PASSWORD"
trap 'unset SSHPASS' EXIT

printf '正在上传 dist 到 %s…\n' "$DEPLOY_HOST"
sshpass -e rsync -av -e 'ssh -o ConnectTimeout=15 -o StrictHostKeyChecking=accept-new' \
  dist "${DEPLOY_USER}@${DEPLOY_HOST}:${DEPLOY_DIRECTORY}/"

printf '正在重启容器 %s…\n' "$DEPLOY_CONTAINER"
sshpass -e ssh -o ConnectTimeout=15 -o StrictHostKeyChecking=accept-new \
  "${DEPLOY_USER}@${DEPLOY_HOST}" "docker restart ${DEPLOY_CONTAINER}"

printf '部署完成。\n'
