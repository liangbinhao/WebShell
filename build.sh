#!/usr/bin/env bash
# build.sh —— 安装依赖并构建（后端：uv + Python 3.11；前端：npm install + npm run build）
# 用法：./build.sh  （可重复执行）
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

# ---- uv 定位 ----
UV_BIN="${UV:-}"
if [ -z "$UV_BIN" ] && command -v uv >/dev/null 2>&1; then
  UV_BIN="$(command -v uv)"
fi
if [ -z "$UV_BIN" ] && [ -x /opt/homebrew/bin/uv ]; then
  UV_BIN=/opt/homebrew/bin/uv
fi
if [ -z "$UV_BIN" ]; then
  echo "!! 未找到 uv，请先安装（brew install uv）" >&2
  exit 1
fi
echo "==> 使用 uv：$UV_BIN"
UV_VERSION="$("$UV_BIN" --version 2>/dev/null || echo '?')"
echo "    version: $UV_VERSION"

# ---- 缓存与托管 Python 均用项目本地目录（避免写 ~/.cache/uv 等系统目录）----
export UV_CACHE_DIR="${UV_CACHE_DIR:-$ROOT/.uv-cache}"
export UV_PYTHON_INSTALL_DIR="${UV_PYTHON_INSTALL_DIR:-$ROOT/.uv-python}"
export UV_PYTHON_BIN_DIR="${UV_PYTHON_BIN_DIR:-$ROOT/.uv-python/bin}"

echo "==> [1/3] 后端依赖（uv + Python 3.11）"
# 如无 3.11 解释器则安装（已在则跳过）
if ! "$UV_BIN" python find 3.11 >/dev/null 2>&1; then
  "$UV_BIN" python install 3.11
fi
(
  cd backend
  # 可重复执行：已有 3.11 的 .venv 则复用，否则（重建/换版本）用 --clear 重建
  if [ -x .venv/bin/python ] && .venv/bin/python -c 'import sys; sys.exit(0 if sys.version_info[:2] == (3, 11) else 1)' >/dev/null 2>&1; then
    echo "    复用现有 backend/.venv（Python 3.11）"
  else
    "$UV_BIN" venv --python 3.11 .venv --clear
  fi
  "$UV_BIN" pip install --python .venv -r requirements.txt
)

echo "==> [2/3] 前端依赖（npm install）"
(cd web && npm install)

echo "==> [3/3] 前端构建（npm run build）"
(cd web && npm run build)

echo ""
echo "==> 构建完成："
echo "    后端 venv  backend/.venv  （$("$ROOT/backend/.venv/bin/python" --version 2>&1)）"
echo "    前端构建  web/dist/"
echo "    启动：./run.sh   停止：./stop.sh   清理：./clean.sh"
