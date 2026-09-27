#!/usr/bin/env bash
# migrate-data.sh —— 把仓库内历史数据（backend/data）复制到正式数据目录（仓库外）
# 只复制、不删除：源目录保留作备份；目标已存在的文件默认跳过，--force 覆盖。
# 跨平台：Windows（Git Bash）/ macOS / Linux
# 用法：./script/migrate-data.sh [--dry-run] [--force]
set -euo pipefail

# ---- 加载公共库 ----
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"
cd "$WS_ROOT"
ensure_utf8_console

DRY_RUN=0
FORCE=0
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --force) FORCE=1 ;;
    *)
      echo "用法：./script/migrate-data.sh [--dry-run] [--force]" >&2
      exit 2
      ;;
  esac
  shift
done

SRC="$WS_ROOT/backend/data"
DST="$(prod_data_dir)"

if [ ! -d "$SRC" ]; then
  echo "==> 源目录不存在（${SRC}），无需迁移"
  exit 0
fi

echo "==> 源（仓库内历史数据）：$SRC"
echo "==> 目标（正式数据，仓库外）：$DST"
if [ "$DRY_RUN" = "0" ]; then
  mark_live_data_dir "$DST"
fi

copied=0
skipped=0
for f in "$SRC"/*; do
  [ -e "$f" ] || continue
  name="$(basename "$f")"
  # 跳过正式数据标记本身，避免把标记当业务数据复制
  if [ "$name" = "$LIVE_DATA_MARKER" ]; then
    continue
  fi
  if [ -e "$DST/$name" ] && [ "$FORCE" != "1" ]; then
    echo "    跳过（目标已存在）：$name"
    skipped=$((skipped + 1))
    continue
  fi
  if [ "$DRY_RUN" = "1" ]; then
    echo "    [dry-run] 将复制：$name"
    continue
  fi
  # -p 保留权限：secret.key 必须保持 0600
  cp -p "$f" "$DST/$name"
  echo "    已复制：$name"
  copied=$((copied + 1))
done

echo ""
if [ "$DRY_RUN" = "1" ]; then
  echo "==> dry-run 结束：未实际复制"
else
  KEY_STATE="缺失（已存服务器密码将无法解密，请检查源目录）"
  if [ -f "$DST/secret.key" ]; then
    KEY_STATE="已就位"
  fi
  echo "==> 迁移完成：复制 $copied 个、跳过 $skipped 个；secret.key $KEY_STATE"
  echo "    源目录保留未删除（${SRC}），可作备份；clean.sh 不再删除它"
  echo "    启动：./script/run.sh（默认使用正式数据）"
fi
