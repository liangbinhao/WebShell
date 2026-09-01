#!/usr/bin/env bash
# clean.sh —— 清理虚拟环境、node_modules、缓存与生成文件（不删除源码）
# 跨平台：Windows（Git Bash）/ macOS / Linux
# 删除：backend/.venv、backend/data、.uv-cache、.uv-python、web/node_modules、
#       web/dist、web/.npm-cache、web/.vite、.run/、__pycache__ 等
# 用法：./script/clean.sh（可重复执行；清理后请重新 ./script/build.sh）
set -euo pipefail

# ---- 加载公共库 ----
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"
cd "$WS_ROOT"
ensure_utf8_console

# 先停止服务，避免清理运行中的产物
if [ -d .run ]; then
  echo "==> 停止运行中的服务"
  "$WS_ROOT/script/stop.sh" || true
fi

echo "==> 清理 Python 生成物"
rm -rf backend/.venv
rm -rf backend/data
rm -rf backend/.pytest_cache
find backend -type d -name __pycache__ -prune -exec rm -rf {} + 2>/dev/null || true
find backend -type f -name '*.py[cod]' -delete 2>/dev/null || true
rm -f backend/.coverage

echo "==> 清理前端生成物"
rm -rf web/node_modules
rm -rf web/dist
rm -rf web/.npm-cache
rm -rf web/.vite

echo "==> 清理 uv 缓存与托管 Python"
rm -rf .uv-cache
rm -rf .uv-python

echo "==> 清理运行状态"
rm -rf .run

echo ""
echo "==> 清理完成（源码未动）"
echo "    重新构建：./script/build.sh；启动：./script/run.sh"
