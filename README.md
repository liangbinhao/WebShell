# Web SSH Workspace

个人使用的 Web SSH 运维工作台：通过浏览器统一管理多台 Linux 服务器，提供接近原生 Shell 的交互式终端体验。

## 功能特性

- **多 Tab 终端**：每个 Tab 独立 SSH 会话，切换不断开，支持 vim / top / tmux 等交互式程序
- **外观系统**：3 套界面主题（暗色/亮色/绿色 CRT）+ 整体缩放 + 终端独立字号/字体/配色（可跟随界面），全局生效
- **服务器管理**：CRUD、收藏、密码 / 私钥认证、跳板机（ProxyJump）多跳
- **命令库**：常用命令分类管理，支持 `{参数}` 模板（点击插入终端，不自动执行，降低误操作风险）
- **命令历史**：记录、搜索、重新插入终端
- **安全**：密码 Fernet 加密落盘、Host key 强校验、WebSocket 断开即释放会话
- **三栏布局 + 暗色主题**：Servers / Terminal Tabs / Commands，左右栏可收起

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 18 + Vite + TypeScript + xterm.js + shadcn/ui (Tailwind) |
| 后端 | Python 3.11 + FastAPI + WebSocket + AsyncSSH（uv 管理虚拟环境） |
| 通信 | REST（`/api`）+ WebSocket（`/ws/terminal`），vite 代理联调 |

## 目录结构

```text
WebShell/
├── AGENTS.md            # Agent 骨架规范（细则按需加载 .dsh/skills/）
├── README.md
├── CHANGELOG.md         # 版本变更记录
├── SECURITY.md          # 安全模型与注意事项
├── LICENSE              # Apache-2.0
├── .dsh/skills/          # Agent 细则 skill（git-commit-rules / testing-strategy 等）
├── docs/                 # 全部文档
│   ├── project/          # 项目文档
│   │   ├── requirements.md  # 需求规格说明书
│   │   ├── CONTRACT.md      # 前后端接口契约（REST + WebSocket 消息格式 + 环境脚本约定）
│   │   └── API.md           # 面向使用者的接口参考（REST + WebSocket）
│   └── novice/           # 新手指南（本机，不入 git）
├── script/              # 项目脚本
│   ├── build.sh         # 安装依赖并构建
│   ├── run.sh           # 启动后端 + 前端
│   ├── stop.sh          # 停止服务
│   └── clean.sh         # 清理生成物
├── backend/             # FastAPI 后端（app/ + tests/ + scripts/）
└── web/                 # React 前端（src/ + e2e/ 核心旅程 E2E）
```

## 快速开始

前置条件：**Node ≥ 18**、**uv**（macOS：`brew install uv`；Windows：见 [uv 文档](https://docs.astral.sh/uv/)）。

> **Windows 用户**：`script/` 下的脚本需要 **Git Bash** 环境执行（CMD/PowerShell 不适用）。脚本已做跨平台适配：自动识别 Windows venv 路径（`.venv/Scripts/python.exe`）与 vite 命令（`.bin/vite.cmd`），并自动将控制台切换为 UTF-8（`chcp 65001`）避免中文日志乱码。

### 从 GitHub 克隆

```bash
git clone <仓库地址> WebShell
cd WebShell
./script/build.sh   # ① 安装依赖并构建（uv 后端 venv + npm 前端，首次需数分钟）
./script/run.sh     # ② 启动：后端 http://127.0.0.1:8000 + 前端 http://127.0.0.1:5173
```

打开 **http://127.0.0.1:5173**：

1. 左栏 **Servers** 点击 **添加**，填写服务器信息（名称、Host、端口、用户名、认证方式）
2. 点击服务器即打开终端 Tab，开始操作

> **首次连接新服务器会失败**：Host key 校验默认开启（安全设计）。按终端提示执行
> `ssh-keyscan -p <port> <host> >> ~/.ssh/known_hosts` 后重试即可。

### 停止与清理

```bash
./script/stop.sh    # 停止服务
./script/clean.sh   # 清理生成物（.venv / node_modules / dist / 数据目录，不删源码）
```

## 测试

```bash
cd backend && uv run pytest        # 后端单元 + API/集成（94 个用例）
cd backend && PYTHONPATH=. uv run python scripts/e2e_ssh_ws.py   # 后端真实 SSH 端到端（跨平台）
./script/run.sh                    # E2E 前置：启动前后端
cd web && npx playwright test      # 前端核心旅程 E2E（真实浏览器 + 真实后端）
```

测试分层与策略见 skill `testing-strategy`（`.dsh/skills/testing-strategy/`）。

## 文档索引

- 需求与验收标准：[docs/project/requirements.md](docs/project/requirements.md)
- 前后端接口契约（含环境与脚本约定）：[docs/project/CONTRACT.md](docs/project/CONTRACT.md)
- **API 接口参考（REST + WebSocket）**：[docs/project/API.md](docs/project/API.md)
- Agent 开发规范：[AGENTS.md](AGENTS.md)
- 后端说明：[backend/README.md](backend/README.md)
- 前端说明：[web/README.md](web/README.md)
- 安全模型：[SECURITY.md](SECURITY.md)
- 版本记录：[CHANGELOG.md](CHANGELOG.md)

## 已知限制

- 首次连接新服务器会因 Host key 未知而失败，需按提示执行 `ssh-keyscan -p <port> <host> >> ~/.ssh/known_hosts`（有意设计，不默认关闭校验）
- 命令历史为启发式识别（按 Enter 时记录输入行），vim/top 等全屏程序内无法精确记录
- 单用户本地使用，不含多用户 / RBAC / 审计（见需求 §22）

## License

Apache-2.0
