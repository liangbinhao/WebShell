#!/usr/bin/env bash
# run.sh —— 启动后端 + 前端（CONTRACT.md §8.2）
# 后端：uv run uvicorn app.main:app --host 127.0.0.1 --port 8000
# 前端：vite dev server（web/，http://127.0.0.1:5173，/api 与 /ws 代理到后端）
# PID 记录到 .run/；可重复执行（先 stop 旧的）。
# 注：启动命令用 `(cd dir && exec cmd) &` 形式，exec 使记录的 PID 即实际服务进程，
#     保证 stop.sh 能精确终止、无残留。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"
RUN_DIR="$ROOT/.run"
mkdir -p "$RUN_DIR"

# 可重复执行：已有服务先停止
if [ -f "$RUN_DIR/frontend.pid" ] || [ -f "$RUN_DIR/backend.pid" ]; then
  echo "==> 检测到已运行的服务，先停止"
  "$ROOT/stop.sh"
fi

# ---- 后端 ----
BACKEND_READY=0
if command -v uv >/dev/null 2>&1 && [ -f backend/app/main.py ]; then
  BACKEND_READY=1
fi

if [ "$BACKEND_READY" -eq 1 ]; then
  echo "==> 启动后端 http://127.0.0.1:8000"
  if [ ! -d backend/.venv ]; then
    echo "   backend/.venv 不存在，请先执行 ./build.sh"
    exit 1
  fi
  # 优先直接运行 .venv 中的 uvicorn；uv run 作为兜底
  if [ -x backend/.venv/bin/uvicorn ]; then
    (cd backend && exec nohup .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 >"$RUN_DIR/backend.log" 2>&1) &
  else
    (cd backend && exec nohup uv run uvicorn app.main:app --host 127.0.0.1 --port 8000 >"$RUN_DIR/backend.log" 2>&1) &
  fi
  echo $! > "$RUN_DIR/backend.pid"
  echo "   后端 pid $(cat "$RUN_DIR/backend.pid")，日志 $RUN_DIR/backend.log"
else
  echo "!! 后端不可用（uv 或 backend/app/main.py 缺失），仅启动前端；API/WS 将不可用"
fi

# ---- 前端 ----
if [ ! -d web/node_modules ]; then
  echo "!! web/node_modules 缺失，请先执行 ./build.sh"
  [ "$BACKEND_READY" -eq 1 ] && rm -f "$RUN_DIR/backend.pid"
  exit 1
fi
echo "==> 启动前端 http://127.0.0.1:5173"
# 直接运行 vite 二进制（等价于 npm run dev，但 PID 即 vite 进程，便于精确停止）
(cd web && exec nohup ./node_modules/.bin/vite --host 127.0.0.1 --port 5173 >"$RUN_DIR/frontend.log" 2>&1) &
echo $! > "$RUN_DIR/frontend.pid"
echo "   前端 pid $(cat "$RUN_DIR/frontend.pid")，日志 $RUN_DIR/frontend.log"

echo ""
echo "==> 服务已启动："
echo "    后端  http://127.0.0.1:8000   $( [ "$BACKEND_READY" -eq 1 ] && echo "(pid $(cat "$RUN_DIR/backend.pid"))" || echo "(未启动)" )"
echo "    前端  http://127.0.0.1:5173   (pid $(cat "$RUN_DIR/frontend.pid"))"
echo "    停止：./stop.sh"
