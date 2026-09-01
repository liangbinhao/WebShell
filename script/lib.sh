#!/usr/bin/env bash
# lib.sh —— script/ 下各脚本共用的跨平台辅助函数
# 用法：source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
# 提供：项目根定位、uv 定位、venv python 路径检测（Unix/Windows）、UTF-8 控制台设置

# ---- 项目根目录（script/ 的上一级）----
if [ -z "${WS_ROOT:-}" ]; then
  WS_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fi

# ---- 检测是否 Windows（MSYS/Git Bash/Cygwin 下 uname 以 MINGW/MSYS/CYGWIN 开头）----
is_windows() {
  case "$(uname -s 2>/dev/null)" in
    MINGW*|MSYS*|CYGWIN*) return 0 ;;
    *) return 1 ;;
  esac
}

# ---- 控制台设为 UTF-8（仅 Windows 需要；Git Bash 继承 cmd 代码页时中文会乱码）----
ensure_utf8_console() {
  if is_windows; then
    # chcp 65001 切 UTF-8 代码页；失败静默（某些环境无 chcp）
    chcp.com 65001 >/dev/null 2>&1 || true
  fi
}

# ---- 定位 uv（环境变量 > PATH > macOS Homebrew 常见位置）----
find_uv() {
  if [ -n "${UV:-}" ]; then
    echo "$UV"
    return 0
  fi
  if command -v uv >/dev/null 2>&1; then
    command -v uv
    return 0
  fi
  if [ -x /opt/homebrew/bin/uv ]; then
    echo /opt/homebrew/bin/uv
    return 0
  fi
  return 1
}

# ---- 定位 venv 中的 python 可执行文件（Unix: bin/python, Windows: Scripts/python.exe）----
# 用法：venv_python <venv_dir>   → 输出路径（不存在则非零退出）
venv_python() {
  local venv_dir="$1"
  if [ -x "$venv_dir/bin/python" ]; then
    echo "$venv_dir/bin/python"
    return 0
  fi
  if [ -x "$venv_dir/Scripts/python.exe" ]; then
    echo "$venv_dir/Scripts/python.exe"
    return 0
  fi
  return 1
}

# ---- 检查 venv 是否为 Python 3.11（跨平台）----
venv_is_py311() {
  local py
  py="$(venv_python "$1")" || return 1
  "$py" -c 'import sys; sys.exit(0 if sys.version_info[:2] == (3, 11) else 1)' >/dev/null 2>&1
}

# ---- uv 缓存/托管 Python 目录（项目本地，避免写系统目录）----
export_uv_local_dirs() {
  export UV_CACHE_DIR="${UV_CACHE_DIR:-$WS_ROOT/.uv-cache}"
  export UV_PYTHON_INSTALL_DIR="${UV_PYTHON_INSTALL_DIR:-$WS_ROOT/.uv-python}"
  export UV_PYTHON_BIN_DIR="${UV_PYTHON_BIN_DIR:-$WS_ROOT/.uv-python/bin}"
}

# ---- 日志目录 .run/ ----
run_dir() {
  echo "$WS_ROOT/.run"
}
