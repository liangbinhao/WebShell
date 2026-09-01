# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 风格，版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [Unreleased]

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
- **命令历史**：记录、搜索、过滤、重新插入终端
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
