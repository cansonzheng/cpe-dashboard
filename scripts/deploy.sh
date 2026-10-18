#!/usr/bin/env bash
set -euo pipefail

DEPLOY_HOST='192.168.20.1'
DEPLOY_USER='root'
DEPLOY_PASSWORD='@@@@####....'
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

export SSHPASS="$DEPLOY_PASSWORD"
trap 'unset SSHPASS' EXIT

printf '正在上传 dist 到 %s…\n' "$DEPLOY_HOST"
sshpass -e rsync -av -e 'ssh -o ConnectTimeout=15 -o StrictHostKeyChecking=accept-new' \
  dist "${DEPLOY_USER}@${DEPLOY_HOST}:${DEPLOY_DIRECTORY}/"

printf '正在重新创建 %s 中的服务…\n' "$DEPLOY_DIRECTORY"
REMOTE_DEPLOY_DIRECTORY="${DEPLOY_DIRECTORY//\'/\'\\\'\'}"
sshpass -e ssh -o ConnectTimeout=15 -o StrictHostKeyChecking=accept-new \
  "${DEPLOY_USER}@${DEPLOY_HOST}" "cd -- '${REMOTE_DEPLOY_DIRECTORY}' && docker-compose down && docker-compose up -d"

printf '部署完成。\n'
