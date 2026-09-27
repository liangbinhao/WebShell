#!/usr/bin/env bash
# clean.sh —— 清理虚拟环境、node_modules、缓存、开发数据与生成文件（不删除源码）
# 跨平台：Windows（Git Bash）/ macOS / Linux
# 删除：backend/.venv、backend/.data-dev（开发数据）、.uv-cache、.uv-python、
#       web/node_modules、web/dist、web/.npm-cache、web/.vite、.run/、__pycache__ 等
# 保护：正式数据在仓库外（~/.webshell/data），本脚本永不触碰；
#       所有目录删除都经 safe_rm_rf 校验（仅限仓库内、且不含 .live-data 标记）
# 用法：./script/clean.sh [--dry-run]（清理后请重新 ./script/build.sh）
set -euo pipefail

# ---- 加载公共库 ----
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"
cd "$WS_ROOT"
ensure_utf8_console

DRY_RUN=0
case "${1:-}" in
  --dry-run) DRY_RUN=1 ;;
  "")
    ;;
  *)
    echo "用法：./script/clean.sh [--dry-run]" >&2
    exit 2
    ;;
esac

# 删除包装：--dry-run 只打印；safe_rm_rf 负责仓库边界 + 正式数据标记保护
remove_path() {
  local path="$1"
  if [ "$DRY_RUN" = "1" ]; then
    echo "    [dry-run] 将删除 $path"
    return 0
  fi
  safe_rm_rf "$path"
}

PROD_DATA="$(prod_data_dir)"
DEV_DATA="$(dev_data_dir)"

echo "==> 正式数据目录（本脚本不会删除）：$PROD_DATA"
if [ -d "$PROD_DATA" ]; then
  echo "    需要备份时：./script/backup.sh"
else
  echo "    （尚未创建；首次执行 ./script/run.sh 时创建）"
fi

# 先停止服务，避免清理运行中的产物（dry-run 不做任何实际动作）
if [ "$DRY_RUN" = "0" ] && [ -d .run ]; then
  echo "==> 停止运行中的服务"
  "$WS_ROOT/script/stop.sh" || true
fi

echo "==> 清理 Python 生成物"
remove_path backend/.venv
remove_path backend/.pytest_cache
remove_path backend/.data-dev
if [ "$DRY_RUN" = "1" ]; then
  echo "    [dry-run] 将删除 backend 下的 __pycache__ 与 *.pyc"
else
  find backend -type d -name __pycache__ -prune -exec rm -rf {} + 2>/dev/null || true
  find backend -type f -name '*.py[cod]' -delete 2>/dev/null || true
  rm -f backend/.coverage
fi

echo "==> 清理前端生成物"
remove_path web/node_modules
remove_path web/dist
remove_path web/.npm-cache
remove_path web/.vite

echo "==> 清理 uv 缓存与托管 Python"
remove_path .uv-cache
remove_path .uv-python

echo "==> 清理运行状态"
remove_path .run

echo ""
if [ "$DRY_RUN" = "1" ]; then
  echo "==> dry-run 结束：以上为将删除的内容，未实际删除（正式数据不在其中）"
else
  echo "==> 清理完成（源码未动；正式数据未触碰）"
  echo "    开发数据已清空：$DEV_DATA"
fi
echo "    重新构建：./script/build.sh；启动：./script/run.sh（默认正式数据）"
