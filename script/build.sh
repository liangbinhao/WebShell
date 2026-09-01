#!/usr/bin/env bash
# build.sh —— 安装依赖并构建（后端：uv + Python 3.11；前端：npm install + npm run build）
# 跨平台：Windows（Git Bash）/ macOS / Linux
# 用法：./script/build.sh  （可重复执行）
set -euo pipefail

# ---- 加载公共库 ----
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"
cd "$WS_ROOT"
ensure_utf8_console

# ---- uv 定位 ----
UV_BIN="$(find_uv)" || {
  echo "!! 未找到 uv，请先安装（macOS: brew install uv；Windows: 见 uv 文档）" >&2
  exit 1
}
echo "==> 使用 uv：$UV_BIN"
echo "    version: $("$UV_BIN" --version 2>/dev/null || echo '?')"

# ---- 缓存与托管 Python 均用项目本地目录（避免写系统目录）----
export_uv_local_dirs

echo "==> [1/3] 后端依赖（uv + Python 3.11）"
# 如无 3.11 解释器则安装（已在则跳过）
if ! "$UV_BIN" python find 3.11 >/dev/null 2>&1; then
  "$UV_BIN" python install 3.11
fi
(
  cd backend
  # 可重复执行：已有 3.11 的 .venv 则复用，否则（重建/换版本）用 --clear 重建
  if venv_is_py311 .venv; then
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
PY="$(venv_python "$WS_ROOT/backend/.venv")" || PY="backend/.venv（python 未找到）"
echo "    后端 venv  backend/.venv  （$("$PY" --version 2>&1)）"
echo "    前端构建  web/dist/"
echo "    启动：./script/run.sh   停止：./script/stop.sh   清理：./script/clean.sh"
