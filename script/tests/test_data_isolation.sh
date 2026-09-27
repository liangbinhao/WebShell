#!/usr/bin/env bash
# test_data_isolation.sh —— 校验数据目录隔离与安全删除保护（无外部依赖）
# 用法：./script/tests/test_data_isolation.sh
# 覆盖：prod/dev 目录解析、.live-data 标记、safe_rm_rf 的仓库边界与标记保护、
#       clean.sh --dry-run 不删除开发数据
set -euo pipefail

REAL_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

pass=0
fail=0
ok() { echo "  [OK] $1"; pass=$((pass + 1)); }
bad() { echo "  [FAIL] $1"; fail=$((fail + 1)); }

# ---- 用临时目录充当“仓库根”，隔离测试 safe_rm_rf 的边界行为 ----
export WS_ROOT="$TMP/ws-root"
export WS_DATA_HOME="$TMP/home"
mkdir -p "$WS_ROOT" "$TMP/outside"
# shellcheck source=../lib.sh
source "$REAL_ROOT/script/lib.sh"

# 1. 目录解析
if [ "$(prod_data_dir)" = "$TMP/home/data" ]; then
  ok "prod_data_dir 使用 WS_DATA_HOME（仓库外）"
else
  bad "prod_data_dir 未使用 WS_DATA_HOME"
fi
if [ "$(dev_data_dir)" = "$WS_ROOT/backend/.data-dev" ]; then
  ok "dev_data_dir 位于仓库内"
else
  bad "dev_data_dir 位置错误"
fi

# 2. 正式数据标记
mark_live_data_dir "$(prod_data_dir)"
if [ -f "$(prod_data_dir)/$LIVE_DATA_MARKER" ]; then
  ok "mark_live_data_dir 写入 .live-data 标记"
else
  bad "标记文件未写入"
fi

# 3. 仓库内普通目录：允许删除
mkdir -p "$WS_ROOT/backend/.data-dev"
safe_rm_rf "$WS_ROOT/backend/.data-dev"
if [ ! -e "$WS_ROOT/backend/.data-dev" ]; then
  ok "仓库内目录可正常删除"
else
  bad "仓库内目录未被删除"
fi

# 4. 仓库外目录：拒绝删除
mkdir -p "$TMP/outside/keep"
if safe_rm_rf "$TMP/outside/keep" 2>/dev/null; then
  bad "仓库外目录不应被删除"
elif [ -e "$TMP/outside/keep" ]; then
  ok "拒绝删除仓库外目录，且目录保留"
else
  bad "仓库外目录被删除"
fi

# 5. 带正式数据标记的目录：拒绝删除
mkdir -p "$WS_ROOT/backend/data"
mark_live_data_dir "$WS_ROOT/backend/data"
if safe_rm_rf "$WS_ROOT/backend/data" 2>/dev/null; then
  bad "带 .live-data 标记的目录不应被删除"
elif [ -e "$WS_ROOT/backend/data/$LIVE_DATA_MARKER" ]; then
  ok "拒绝删除带 .live-data 标记的目录"
else
  bad "标记目录被删除"
fi

# 6. clean.sh --dry-run 不删除开发数据（在真实仓库上验证）
mkdir -p "$REAL_ROOT/backend/.data-dev"
: >"$REAL_ROOT/backend/.data-dev/sentinel.txt"
if (cd "$REAL_ROOT" && env -u WS_DATA_HOME ./script/clean.sh --dry-run >/dev/null 2>&1); then
  if [ -f "$REAL_ROOT/backend/.data-dev/sentinel.txt" ]; then
    ok "clean.sh --dry-run 未删除开发数据"
  else
    bad "clean.sh --dry-run 删除了开发数据"
  fi
else
  bad "clean.sh --dry-run 执行失败"
fi
rm -rf "$REAL_ROOT/backend/.data-dev"

# 7. 脚本卫生：禁止 $VAR 紧跟非 ASCII 字符
#    非 UTF-8 locale 下 bash 会把多字节字符首字节并入变量名，set -u 直接报 unbound 退出
BAD_LINES="$(grep -rnE '\$[A-Za-z_][A-Za-z0-9_]*[^ -~]' "$REAL_ROOT/script" --include='*.sh' || true)"
if [ -z "$BAD_LINES" ]; then
  ok "脚本无「\$VAR 紧跟非 ASCII」写法（应统一写 \${VAR}）"
else
  bad "存在 \$VAR 紧跟非 ASCII 的写法，请改为 \${VAR}："
  echo "$BAD_LINES" | sed 's/^/      /'
fi

echo ""
echo "==> 结果：通过 ${pass}，失败 ${fail}"
[ "$fail" -eq 0 ]
