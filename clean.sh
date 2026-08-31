#!/usr/bin/env bash
# clean.sh —— 清理生成物（CONTRACT.md §8.2）
# 删除：backend/.venv、web/node_modules、web/dist、web/.npm-cache、.run/、缓存与生成文件
# 不删除源码；先停止运行中的服务。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

if [ -d .run ]; then
  echo "==> 停止运行中的服务"
  ./stop.sh || true
fi

echo "==> 删除 Python 生成物"
rm -rf backend/.venv
rm -rf .uv-cache .uv-python
find backend -name '__pycache__' -type d -prune -exec rm -rf {} + 2>/dev/null || true
find backend -name '*.py[cod]' -delete 2>/dev/null || true
rm -rf backend/.pytest_cache

echo "==> 删除前端生成物"
rm -rf web/node_modules web/dist web/.npm-cache
rm -rf web/.vite

echo "==> 删除运行状态"
rm -rf .run

echo "==> 清理完成（源码未动）"
echo "    重新构建：./build.sh；启动：./run.sh"
