#!/usr/bin/env bash
# run.sh —— 启动后端（uv run uvicorn，127.0.0.1:8000）+ 前端（vite dev，127.0.0.1:5173）
# 后端提供 REST（/api）与 WebSocket（/ws）；前端 vite 将 /api、/ws 代理到后端。
# PID 记录到 .run/；可重复执行（先 stop 旧的）；停止：./script/stop.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
RUN_DIR="$ROOT/.run"
mkdir -p "$RUN_DIR"

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

# ---- 缓存与托管 Python 均用项目本地目录 ----
export UV_CACHE_DIR="${UV_CACHE_DIR:-$ROOT/.uv-cache}"
export UV_PYTHON_INSTALL_DIR="${UV_PYTHON_INSTALL_DIR:-$ROOT/.uv-python}"
export UV_PYTHON_BIN_DIR="${UV_PYTHON_BIN_DIR:-$ROOT/.uv-python/bin}"

# 可重复执行：已有服务先停止
if [ -f "$RUN_DIR/backend.pid" ] || [ -f "$RUN_DIR/frontend.pid" ]; then
  echo "==> 检测到已运行的服务，先停止"
  "$ROOT/script/stop.sh"
fi

# ---- 后端：uv run uvicorn app.main:app --host 127.0.0.1 --port 8000 ----
if [ ! -x backend/.venv/bin/python ]; then
  echo "!! backend/.venv 不存在，请先执行 ./script/build.sh" >&2
  exit 1
fi
echo "==> 启动后端 http://127.0.0.1:8000"
(cd backend && exec nohup "$UV_BIN" run uvicorn app.main:app --host 127.0.0.1 --port 8000 >"$RUN_DIR/backend.log" 2>&1) &
echo $! > "$RUN_DIR/backend.pid"
echo "   后端 pid $(cat "$RUN_DIR/backend.pid")，日志 $RUN_DIR/backend.log"

# ---- 前端：vite dev server（web/，http://127.0.0.1:5173）----
if [ ! -d web/node_modules ]; then
  echo "!! web/node_modules 缺失，请先执行 ./script/build.sh" >&2
  rm -f "$RUN_DIR/backend.pid"
  "$ROOT/script/stop.sh" || true
  exit 1
fi
echo "==> 启动前端 http://127.0.0.1:5173"
# 直接运行 vite 二进制（等价于 npm run dev，但 PID 即 vite 进程，便于精确停止）
(cd web && exec nohup ./node_modules/.bin/vite --host 127.0.0.1 --port 5173 >"$RUN_DIR/frontend.log" 2>&1) &
echo $! > "$RUN_DIR/frontend.pid"
echo "   前端 pid $(cat "$RUN_DIR/frontend.pid")，日志 $RUN_DIR/frontend.log"

echo ""
echo "==> 服务已启动："
echo "    后端  http://127.0.0.1:8000   (pid $(cat "$RUN_DIR/backend.pid"))"
echo "    前端  http://127.0.0.1:5173   (pid $(cat "$RUN_DIR/frontend.pid"))"
echo "    停止：./script/stop.sh"
