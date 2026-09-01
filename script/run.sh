#!/usr/bin/env bash
# run.sh —— 启动后端（uv run uvicorn，127.0.0.1:8000）+ 前端（vite dev，127.0.0.1:5173）
# 跨平台：Windows（Git Bash）/ macOS / Linux
# 后端提供 REST（/api）与 WebSocket（/ws）；前端 vite 将 /api、/ws 代理到后端。
# PID 记录到 .run/；可重复执行（先 stop 旧的）；停止：./script/stop.sh
set -euo pipefail

# ---- 加载公共库 ----
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"
cd "$WS_ROOT"
ensure_utf8_console
RUN_DIR="$(run_dir)"
mkdir -p "$RUN_DIR"

# ---- uv 定位 ----
UV_BIN="$(find_uv)" || {
  echo "!! 未找到 uv，请先安装（macOS: brew install uv；Windows: 见 uv 文档）" >&2
  exit 1
}

# ---- 缓存与托管 Python 均用项目本地目录 ----
export_uv_local_dirs

# ---- Python 输出统一 UTF-8（Windows 下避免日志文件 GBK 编码乱码）----
export PYTHONIOENCODING=utf-8
export PYTHONUTF8=1

# 可重复执行：已有服务先停止
if [ -f "$RUN_DIR/backend.pid" ] || [ -f "$RUN_DIR/frontend.pid" ]; then
  echo "==> 检测到已运行的服务，先停止"
  "$WS_ROOT/script/stop.sh"
fi

# ---- 后端：uv run uvicorn app.main:app --host 127.0.0.1 --port 8000 ----
if ! venv_python "$WS_ROOT/backend/.venv" >/dev/null 2>&1; then
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
  "$WS_ROOT/script/stop.sh" || true
  exit 1
fi
echo "==> 启动前端 http://127.0.0.1:5173"
# 跨平台定位 vite 二进制：Unix 用 .bin/vite，Windows（Git Bash）用 .bin/vite.cmd
# 注意：下方在 (cd web && ...) 子 shell 中执行，这里须用绝对路径
VITE_BIN="$WS_ROOT/web/node_modules/.bin/vite"
if is_windows && [ -f "$WS_ROOT/web/node_modules/.bin/vite.cmd" ]; then
  VITE_BIN="$WS_ROOT/web/node_modules/.bin/vite.cmd"
fi
(cd web && exec nohup "$VITE_BIN" --host 127.0.0.1 --port 5173 >"$RUN_DIR/frontend.log" 2>&1) &
echo $! > "$RUN_DIR/frontend.pid"
echo "   前端 pid $(cat "$RUN_DIR/frontend.pid")，日志 $RUN_DIR/frontend.log"

echo ""
echo "==> 服务已启动："
echo "    后端  http://127.0.0.1:8000   (pid $(cat "$RUN_DIR/backend.pid"))"
echo "    前端  http://127.0.0.1:5173   (pid $(cat "$RUN_DIR/frontend.pid"))"
echo "    停止：./script/stop.sh"
