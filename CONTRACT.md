# Web SSH Workspace — 前后端接口契约

本文档是前端与后端并行开发时共同遵守的接口约定。**任何一侧需要变更接口，必须先修改本文档，再同步实现。**

## 1. 通用约定

* 数据格式：JSON；时间戳为 Unix 毫秒（number）。
* 后端监听 `127.0.0.1:8000`；前端 Vite dev server 通过 proxy 转发 `/api` 与 `/ws`。
* 错误响应：`{"detail": "错误信息"}`（FastAPI 默认）或 `{"error": "..."}`。

## 2. 数据模型

### Server（服务器）

```json
{
  "id": "uuid-string",
  "name": "DEV-01",
  "host": "10.10.1.20",
  "port": 22,
  "username": "developer",
  "auth_type": "password | key",
  "password": "仅创建/更新时提交，响应中永不返回",
  "key_path": "私钥绝对路径（auth_type=key 时）",
  "passphrase": "私钥口令（可选）",
  "proxy_jump": ["跳板服务器 id 列表，按顺序"],
  "favorite": false,
  "created_at": 1725000000000,
  "updated_at": 1725000000000
}
```

响应中服务器对象**禁止包含** `password`、`passphrase` 字段（返回 `auth_type` 即可）。

### Command（常用命令）

```json
{
  "id": "uuid-string",
  "name": "查看磁盘",
  "content": "df -h",
  "category": "Linux",
  "description": "查看磁盘使用情况",
  "favorite": false,
  "created_at": 1725000000000,
  "updated_at": 1725000000000
}
```

命令模板：`content` 中支持 `{参数名}` 占位符，前端据此生成参数表单。

### HistoryEntry（命令历史）

```json
{
  "id": "uuid-string",
  "server_id": "uuid-string",
  "server_name": "DEV-01",
  "username": "developer",
  "command": "docker ps",
  "executed_at": 1725000000000
}
```

## 3. REST API（前缀 /api）

### 服务器

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/servers` | 服务器列表（不返回密码字段） |
| POST | `/api/servers` | 新增（body 含 password/key_path） |
| PUT | `/api/servers/{id}` | 更新（password 缺省表示不修改密码） |
| DELETE | `/api/servers/{id}` | 删除 |
| PATCH | `/api/servers/{id}/favorite` | 切换收藏，body `{"favorite": bool}` |
| POST | `/api/servers/import-ssh-config` | 从 `~/.ssh/config` 导入，返回 `{"added": n, "skipped": n}` |

### 命令

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/commands` | 命令列表（支持 `?category=` 过滤） |
| POST | `/api/commands` | 新增命令 |
| PUT | `/api/commands/{id}` | 更新命令 |
| DELETE | `/api/commands/{id}` | 删除命令 |
| PATCH | `/api/commands/{id}/favorite` | 切换收藏 |
| GET | `/api/commands/categories` | 去重后的分类列表 |

### 历史

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/history` | 历史列表（`?q=` 搜索命令内容；`?server_id=` 过滤） |
| POST | `/api/history` | 记录一条历史（前端在用户执行命令时调用） |
| DELETE | `/api/history/{id}` | 删除一条历史 |

## 4. WebSocket 终端（/ws/terminal）

连接：`ws://host:8000/ws/terminal?server_id=<uuid>`

### 客户端 → 服务端

```json
{"type": "input", "data": "ls -la\r"}
{"type": "resize", "cols": 120, "rows": 30}
```

### 服务端 → 客户端

```json
{"type": "output", "data": "远程 shell 输出（含 ANSI 转义）"}
{"type": "status", "state": "connecting"}
{"type": "status", "state": "connected"}
{"type": "status", "state": "disconnected"}
{"type": "error", "message": "Failed to connect to DEV-01"}
```

* 服务端必须为每个 WebSocket 连接建立独立 SSH 会话（PTY），**不是一次性 exec**。
* 会话关闭（服务端收到 close 帧或 SSH 断开）时，必须释放 SSH 连接与相关资源。
* 支持 resize：客户端窗口变化时发送 resize，服务端调用远程 PTY 的 resize。
* 连接状态变化必须通过 `status` 消息主动推送。

## 5. 安全约定

* 密码、私钥路径**永不**出现在 GET 响应中。
* 密码在服务端加密存储（`cryptography.Fernet` 或系统 keyring），不落明文。
* WebSocket 必须与对应 SSH Session 建立明确关联，连接断开即释放。
* 前端不持有任何密码明文（仅创建/更新时短暂提交）。

## 6. 目录结构（后端）

```text
app/
├── main.py            # FastAPI 入口，挂载路由与 WebSocket
├── api/               # REST 路由：servers.py / commands.py / history.py
├── websocket/         # 终端 WebSocket 端点
├── ssh/
│   ├── manager.py     # 会话管理器（多会话生命周期）
│   ├── session.py     # 单个 SSH 会话封装
│   └── connection.py  # 连接建立（含跳板机）
├── models/            # Pydantic 数据模型
├── config/            # 配置与存储（JSON 文件存储，与接口解耦）
└── utils/
```

## 7. 前端结构

```text
web/
├── src/
│   ├── App.tsx               # 三栏布局
│   ├── api/                  # REST + WebSocket 客户端
│   ├── components/
│   │   ├── ServersPanel.tsx  # 左栏：服务器列表 + CRUD
│   │   ├── TerminalTabs.tsx  # 中栏：多 Tab 终端
│   │   ├── CommandsPanel.tsx # 右栏：命令库 + 模板
│   │   ├── HistoryPanel.tsx  # 历史
│   │   └── Terminal.tsx      # xterm.js 封装
│   └── types.ts              # 与契约一致的类型
└── vite.config.ts            # proxy: /api -> localhost:8000, /ws -> ws://localhost:8000
```
