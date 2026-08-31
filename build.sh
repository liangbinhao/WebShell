#!/usr/bin/env bash
# build.sh —— 安装依赖并构建（CONTRACT.md §8.2）
# 后端：uv pip install -r backend/requirements.txt
# 前端：npm install && npm run build（在 web/ 下）
# 可重复执行；从项目根目录运行；无交互提示（CI 友好）。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

# 本机 ~/.cache/uv、~/.local/share/uv 可能存在 root 属主文件导致 uv 报 EPERM，
# 缓存与托管 Python 均改用项目本地目录（对正常机器无影响）
export UV_CACHE_DIR="${UV_CACHE_DIR:-$ROOT/.uv-cache}"
export UV_PYTHON_DIR="${UV_PYTHON_DIR:-$ROOT/.uv-python}"
export UV_PYTHON_INSTALL_DIR="${UV_PYTHON_INSTALL_DIR:-$ROOT/.uv-python}"

echo "==> [backend] 安装依赖 (uv)"
if command -v uv >/dev/null 2>&1; then
  if [ ! -d backend/.venv ]; then
    echo "   创建 backend/.venv (Python 3.11)"
    (cd backend && uv venv --python 3.11)
  fi
  (cd backend && uv pip install -r requirements.txt)
else
  echo "!! 未找到 uv（期望 /opt/homebrew/bin/uv），跳过后端依赖安装"
fi

echo "==> [frontend] npm install && npm run build (web/)"
(cd web && npm install && npm run build)

echo "==> 构建完成"
echo "    - 后端依赖: backend/.venv"
echo "    - 前端产物: web/dist"
