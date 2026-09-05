# Web SSH Workspace — 后端 (backend/)

FastAPI + AsyncSSH 实现的后端：REST API + WebSocket 终端 + SSH 会话管理（uv + Python 3.11）。

## 快速开始

前置条件：已安装 uv。由项目根目录的 `script/` 脚本统一管理（推荐）：

```bash
cd ..                # 项目根目录
./script/build.sh    # 创建 backend/.venv（Python 3.11）+ 安装依赖
./script/run.sh      # 启动后端（127.0.0.1:8000）+ 前端
```

手动启动（仅后端）：

```bash
cd backend
uv venv --python 3.11 .venv
uv pip install -r requirements.txt
uv run uvicorn app.main:app --host 127.0.0.1 --port 8000
```

## 运行测试

```bash
cd backend
uv run pytest            # 94 个用例（单元 + API/集成 + WebSocket）
uv run python scripts/e2e_ssh_ws.py   # 真实 SSH 端到端（asyncssh 服务器 → REST → WebSocket）
uv run python scripts/smoke_ssh_local.py  # 本地 SSH 集成冒烟（开发期）
```

## 目录结构

```text
backend/
├── app/
│   ├── main.py            # FastAPI 入口 + 应用工厂（create_app，可注入 connector 测试）
│   ├── api/               # REST 路由：servers / commands / history
│   ├── websocket/         # 终端 WebSocket 端点（/ws/terminal）
│   ├── ssh/
│   │   ├── connection.py  # SSH 连接建立（密码/私钥认证 + 跳板机 + host key 校验）
│   │   ├── session.py     # 单个交互式 PTY shell 会话封装
│   │   └── manager.py     # 多会话生命周期管理
│   ├── models/            # Pydantic 模型（请求/响应，响应不含敏感字段）
│   ├── config/            # Settings + Storage（JSON 存储、原子写、加密）
│   └── utils/             # crypto（Fernet）/ ssh_config 导入 / 模板解析
├── scripts/               # 开发验证脚本（e2e / smoke）
├── tests/                 # pytest 测试
├── requirements.txt
└── pytest.ini
```

## 数据与配置

- 数据目录：`backend/data/`（servers.json / commands.json / history.json + secret.key），**已被 .gitignore 排除，勿提交**
- 环境变量：`WS_DATA_DIR`、`WS_KNOWN_HOSTS`、`WS_SSH_CONFIG`（详见 [doc/API.md §6](../docs/project/API.md)）
- 其他参数（超时、keepalive、历史上限、CORS）见 `app/config/settings.py`

## API

完整接口参考见 [doc/API.md](../docs/project/API.md)（REST + WebSocket 消息格式、错误码、示例）。
