# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 风格，版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### 新增

- **数据目录环境隔离**：正式数据移到仓库外 `~/.webshell/data`（`run.sh` 默认使用，`clean.sh`/`git clean`/重新 clone 均不影响）；开发数据放仓库内 `backend/.data-dev`（`run.sh --dev`）
- **`script/backup.sh`**：备份正式数据为 tar.gz（`~/.webshell/backups/`），含解密密钥 `secret.key`
- **`script/migrate-data.sh`**：把仓库内历史数据（`backend/data`）复制到正式数据目录，只复制、不删源
- **`script/tests/test_data_isolation.sh`**：脚本自测（数据目录解析、安全删除边界、`clean.sh --dry-run`）

### 变更

- **开源协议由 Apache-2.0 改为 MIT**：`LICENSE` 替换为 MIT 全文，README 目录树与 License 段、`web/package.json` 的 `license` 字段同步
- **`clean.sh` 不再删除数据**：只清理开发数据与生成物，新增 `--dry-run` 预览；删除统一经 `safe_rm_rf` 校验（仅限仓库内、拒绝含 `.live-data` 标记的目录）

### 修复

- **确认对话框点击"确认"后不关闭**：`ConfirmDialog` 在确认按钮上调用 `preventDefault()`，而 Radix 的 `AlertDialog.Action` 依赖默认行为关闭弹窗，导致确认后弹窗停留（只有"取消"能关）。影响清空历史、删除历史/命令/服务器等全部确认弹窗。已移除 `preventDefault`，`confirmVariant` 真正生效，描述支持换行；新增 E2E 回归 `web/e2e/confirm-dialog.spec.ts`
- **安全：密码提示的输入不再记入命令历史**。`su` / `sudo` / `passwd` / `mysql -p` 等在读取密码时远端关闭回显，此前前端仍会把本地缓冲的内容当作"命令"写入历史。现在识别密码提示行（`web/src/lib/secretPrompt.ts`）后跳过记录并清空缓冲；新增 `DELETE /api/history` 与历史面板"清空全部历史"按钮，便于清理已误记录的敏感内容

### 计划中

- Terminal Split（终端分屏，见需求 §9）
- SFTP 文件操作（文件浏览/上传/下载，见需求 §14）
- Workspace（工作区保存与恢复，见需求 §13）
- 前端 chunk 分割优化（xterm manualChunks）

## [0.1.0] - 2026-09-01

### 新增（MVP）

- **Web 终端**：多 Tab 独立 SSH 会话（xterm.js + WebSocket），支持 vim / top / tmux 等交互式程序；resize 自适应；断开提示与重连
- **终端显示设置**：字体大小（10–20px）、7 种等宽字体、3 套配色方案（暗色/亮色/绿色 CRT），全局生效、localStorage 持久化、运行时实时更新
- **服务器管理**：CRUD、收藏、密码 / 私钥认证、`~/.ssh/config` 一键导入
- **跳板机（ProxyJump）**：按顺序多跳连接，每跳独立认证
- **常用命令库**：分类管理、收藏、`{参数}` 模板生成
- **命令历史**：轻量辅助（同命令去重、保留最近 200 条），搜索/删除/重新插入；高价值复用以命令库为主（见需求 §12）
- **安全**：密码 Fernet 加密存储、Host key 强校验（不默认关闭）、SSH keepalive、WebSocket 断开即释放会话
- **前后端分离**：FastAPI 后端（`backend/`）+ React 前端（`web/`）

### 工程

- 环境：uv + Python 3.11（后端）、npm（前端）
- 脚本：`script/build.sh` / `run.sh` / `stop.sh` / `clean.sh`
- 测试：后端 93 个用例（单元 + SSH mock + WebSocket）；真实 SSH 端到端脚本 `backend/scripts/e2e_ssh_ws.py`

### 已知限制

- 首次连接新服务器因 Host key 未知会失败，需按提示执行 `ssh-keyscan`
- 命令历史为启发式识别（按 Enter 记录输入行），vim/top 等全屏程序内无法精确记录
- 前端主 chunk > 500KB（xterm.js 体积），gzip 后约 178KB，MVP 可接受
- 单用户本地使用，无多用户 / RBAC / 审计
