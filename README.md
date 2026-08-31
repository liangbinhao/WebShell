# Web SSH Workspace

个人使用的 Web SSH 运维工作台：通过浏览器统一管理多台 Linux 服务器，提供接近原生 Shell 的交互式终端体验。

## 功能特性

- **多 Tab 终端**：每个 Tab 独立 SSH 会话，切换不断开，支持 vim / top / tmux 等交互式程序
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
├── doc/                # 文档（需求、契约、规范）
│   ├── requirements.md # 需求规格说明书
│   ├── CONTRACT.md     # 前后端接口契约（REST + WebSocket 消息格式 + 环境脚本约定）
│   └── AGENTS.md       # Agent 开发规范
├── script/             # 项目脚本
│   ├── build.sh        # 安装依赖并构建
│   ├── run.sh          # 启动后端 + 前端
│   ├── stop.sh         # 停止服务
│   └── clean.sh        # 清理生成物
├── backend/            # FastAPI 后端（app/ + tests/ + scripts/）
└── web/                # React 前端
```

## 快速开始

前置条件：Node ≥ 18、uv（`brew install uv`）。

```bash
./script/build.sh   # 安装依赖并构建（uv 后端 venv + npm 前端）
./script/run.sh     # 启动：后端 http://127.0.0.1:8000 + 前端 http://127.0.0.1:5173
```

打开 **http://127.0.0.1:5173**，在左栏添加服务器即可连接。

```bash
./script/stop.sh    # 停止服务
./script/clean.sh   # 清理生成物（.venv / node_modules / dist 等，不删源码）
```

## 测试

```bash
cd backend && uv run pytest        # 93 个用例（单元 + SSH mock + WebSocket）
cd backend && PYTHONPATH=. .venv/bin/python scripts/e2e_ssh_ws.py   # 真实 SSH 端到端
```

## 文档索引

- 需求与验收标准：[doc/requirements.md](doc/requirements.md)
- 前后端接口契约（含环境与脚本约定）：[doc/CONTRACT.md](doc/CONTRACT.md)
- Agent 开发规范：[doc/AGENTS.md](doc/AGENTS.md)
- 前端说明：[web/README.md](web/README.md)

## 已知限制

- 首次连接新服务器会因 Host key 未知而失败，需按提示执行 `ssh-keyscan -p <port> <host> >> ~/.ssh/known_hosts`（有意设计，不默认关闭校验）
- 命令历史为启发式识别（按 Enter 时记录输入行），vim/top 等全屏程序内无法精确记录
- 单用户本地使用，不含多用户 / RBAC / 审计（见需求 §22）

## License

Apache-2.0
