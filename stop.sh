#!/usr/bin/env bash
# stop.sh —— 按 .run/ 中记录的 PID 停止后端与前端（CONTRACT.md §8.2）
# 无残留进程；可重复执行。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUN_DIR="$ROOT/.run"

stop_one() {
  local name="$1"
  local pid_file="$RUN_DIR/$name.pid"
  if [ ! -f "$pid_file" ]; then
    return 0
  fi
  local pid
  pid="$(cat "$pid_file" 2>/dev/null || true)"
  rm -f "$pid_file"

  if [ -z "${pid:-}" ] || ! kill -0 "$pid" 2>/dev/null; then
    echo "==> $name 未在运行（pid ${pid:-无}）"
    return 0
  fi

  echo "==> 停止 $name (pid $pid)"
  kill "$pid" 2>/dev/null || true
  # 顺带终止其直接子进程（如 npm/vite 包装进程）
  pkill -P "$pid" 2>/dev/null || true

  # 等待退出（最多 3 秒）
  for _ in 1 2 3 4 5 6; do
    if ! kill -0 "$pid" 2>/dev/null; then
      break
    fi
    sleep 0.5
  done

  if kill -0 "$pid" 2>/dev/null; then
    echo "==> $name 未正常退出，强制终止"
    kill -9 "$pid" 2>/dev/null || true
    pkill -9 -P "$pid" 2>/dev/null || true
  fi
}

stop_one backend
stop_one frontend

# 兜底：按项目专属命令行模式清理残留进程（不影响其他项目/无关进程）
pkill -f "\.venv/bin/uvicorn app\.main:app --host 127\.0\.0\.1 --port 8000" 2>/dev/null || true
pkill -f "node \./node_modules/\.bin/vite --host 127\.0\.0\.1 --port 5173" 2>/dev/null || true

if compgen -G "$RUN_DIR/*.pid" >/dev/null 2>&1; then
  rm -f "$RUN_DIR"/*.pid
fi

echo "==> 全部服务已停止"
