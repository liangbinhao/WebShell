#!/usr/bin/env bash
# backup.sh —— 备份正式数据（servers / commands / history JSON + secret.key）为 tar.gz
# 跨平台：Windows（Git Bash）/ macOS / Linux
# 备份位置：~/.webshell/backups/webshell-data-<时间戳>.tar.gz（根目录可用 WS_DATA_HOME 覆盖）
# 用法：./script/backup.sh [--data-dir <路径>]
# 注意：secret.key 丢失会导致已保存的服务器密码无法解密，建议定期备份。
set -euo pipefail

# ---- 加载公共库 ----
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"
cd "$WS_ROOT"
ensure_utf8_console

DATA_DIR="$(prod_data_dir)"
while [ $# -gt 0 ]; do
  case "$1" in
    --data-dir)
      [ $# -ge 2 ] || {
        echo "!! --data-dir 需要参数" >&2
        exit 2
      }
      DATA_DIR="$2"
      shift 2
      ;;
    *)
      echo "用法：./script/backup.sh [--data-dir <路径>]" >&2
      exit 2
      ;;
  esac
done

if [ ! -d "$DATA_DIR" ]; then
  echo "!! 数据目录不存在：$DATA_DIR" >&2
  echo "   若数据仍在仓库内，先执行：./script/migrate-data.sh" >&2
  exit 1
fi

BACKUP_ROOT="${WS_DATA_HOME:-$HOME/.webshell}/backups"
mkdir -p "$BACKUP_ROOT"
STAMP="$(date +%Y%m%d-%H%M%S)"
ARCHIVE="$BACKUP_ROOT/webshell-data-$STAMP.tar.gz"

tar -czf "$ARCHIVE" -C "$(dirname "$DATA_DIR")" "$(basename "$DATA_DIR")"
# 校验压缩包可读，避免留下损坏的备份
tar -tzf "$ARCHIVE" >/dev/null

ENTRIES="$(tar -tzf "$ARCHIVE" | wc -l | tr -d ' ')"
echo "==> 备份完成：$ARCHIVE"
echo "    条目数：$ENTRIES"
echo "    恢复：tar -xzf \"$ARCHIVE\" -C \"$(dirname "$DATA_DIR")\""
