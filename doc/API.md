# Web SSH Workspace — API 参考

本文件是面向使用者的接口参考（REST + WebSocket）。开发契约见 [CONTRACT.md](CONTRACT.md)，数据流与需求见 [requirements.md](requirements.md)。

- Base URL：`http://127.0.0.1:8000`（后端直连）或 `http://127.0.0.1:5173`（经 vite 代理，`/api` 与 `/ws` 自动转发）
- 数据格式：JSON；时间戳为 Unix 毫秒（number）
- 错误响应：`{"detail": "错误信息"}`（HTTP 4xx/5xx）

---

## 1. 服务器管理 `/api/servers`

### 1.1 服务器对象

请求（创建/更新）中可含敏感字段，**响应中永不返回**：

```json
{
  "name": "DEV-01",
  "host": "10.10.1.20",
  "port": 22,
  "username": "developer",
  "auth_type": "password | key",
  "password": "仅创建时提交，响应中不返回",
  "key_path": "私钥绝对路径（auth_type=key 时）",
  "passphrase": "私钥口令（可选）",
  "proxy_jump": ["跳板服务器 id 列表，按顺序"],
  "favorite": false
}
```

响应对象（`ServerOut`）：

```json
{
  "id": "uuid-string",
  "name": "DEV-01",
  "host": "10.10.1.20",
  "port": 22,
  "username": "developer",
  "auth_type": "password",
  "proxy_jump": [],
  "favorite": false,
  "created_at": 1725000000000,
  "updated_at": 1725000000000
}
```

### 1.2 端点

| 方法 | 路径 | 说明 | 成功响应 |
|---|---|---|---|
| GET | `/api/servers` | 列表（收藏在前，按创建时间排序） | `200` `ServerOut[]` |
| POST | `/api/servers` | 新增 | `201` `ServerOut` |
| PUT | `/api/servers/{id}` | 更新（`password`/`passphrase` 缺省或 `null` = 不修改） | `200` `ServerOut` |
| PATCH | `/api/servers/{id}/favorite` | 切换收藏，body `{"favorite": bool}` | `200` `ServerOut` |
| DELETE | `/api/servers/{id}` | 删除（同时关闭该服务器的活动 SSH 会话） | `204` 无内容 |
| POST | `/api/servers/import-ssh-config` | 从 `~/.ssh/config` 导入（通配符跳过、重名去重） | `200` `{"added": n, "skipped": n}` |

示例（新增服务器）：

```bash
curl -X POST http://127.0.0.1:8000/api/servers \
  -H "Content-Type: application/json" \
  -d '{"name":"DEV-01","host":"10.10.1.20","username":"dev","auth_type":"password","password":"secret"}'
```

---

## 2. 常用命令 `/api/commands`

### 2.1 命令对象

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

`content` 支持 `{参数名}` 占位符（模板），前端据此生成参数表单；生成的命令**只插入终端，不自动执行**。

### 2.2 端点

| 方法 | 路径 | 说明 | 成功响应 |
|---|---|---|---|
| GET | `/api/commands` | 列表（`?category=` 过滤，收藏在前） | `200` `CommandOut[]` |
| GET | `/api/commands/categories` | 去重分类列表 | `200` `string[]` |
| POST | `/api/commands` | 新增 | `201` `CommandOut` |
| PUT | `/api/commands/{id}` | 更新 | `200` `CommandOut` |
| PATCH | `/api/commands/{id}/favorite` | 切换收藏，body `{"favorite": bool}` | `200` `CommandOut` |
| DELETE | `/api/commands/{id}` | 删除 | `204` 无内容 |

---

## 3. 命令历史 `/api/history`

### 3.1 历史对象

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

### 3.2 端点

| 方法 | 路径 | 说明 | 成功响应 |
|---|---|---|---|
| GET | `/api/history` | 列表（`?q=` 搜索命令、`?server_id=` 过滤、`?limit=` 限制条数；最新在前，默认上限 500） | `200` `HistoryOut[]` |
| POST | `/api/history` | 记录一条（前端在用户执行命令时调用；自动裁剪至 2000 条） | `201` `HistoryOut` |
| DELETE | `/api/history/{id}` | 删除一条 | `204` 无内容 |

示例（记录历史）：

```bash
curl -X POST http://127.0.0.1:8000/api/history \
  -H "Content-Type: application/json" \
  -d '{"server_id":"...","server_name":"DEV-01","username":"dev","command":"df -h"}'
```

---

## 4. WebSocket 终端 `/ws/terminal`

连接：`ws://<host>:8000/ws/terminal?server_id=<uuid>`（经 vite 代理时用 `ws://127.0.0.1:5173/ws/terminal?...`）

查询参数：`server_id`（必填）、`cols`/`rows`（可选，初始终端尺寸，默认 120×30）。

### 4.1 客户端 → 服务端

```json
{"type": "input", "data": "ls -la\r"}
{"type": "resize", "cols": 120, "rows": 30}
```

### 4.2 服务端 → 客户端

| type | 字段 | 说明 |
|---|---|---|
| `output` | `data` | 远程 shell 输出（含 ANSI 转义序列） |
| `status` | `state` | 连接状态：`connecting` / `connected` / `disconnected` |
| `error` | `message` | 错误信息（如连接失败、服务器不存在） |

### 4.3 行为约定

- 每个 WebSocket 连接对应**一个独立 SSH 会话**（交互式 PTY shell，非一次性 exec）
- 支持 resize：窗口变化时发送 resize，服务端同步远程 PTY
- 服务端收到 close 帧或 SSH 断开时，释放对应会话与资源
- 连接状态变化通过 `status` 消息主动推送

示例消息流（完整会话）：

```text
→ (连接) ws://host/ws/terminal?server_id=xxx
← {"type":"status","state":"connecting"}
← {"type":"status","state":"connected"}
→ {"type":"input","data":"echo hello\r"}
← {"type":"output","data":"echo hello\r\nhello\r\n$ "}
→ {"type":"resize","cols":140,"rows":40}
→ (浏览器关闭连接)
← {"type":"status","state":"disconnected"}
```

---

## 5. 错误码

| 状态码 | 场景 |
|---|---|
| `400` | 请求体校验失败（字段缺失、port 越界等） |
| `404` | 资源不存在（服务器/命令/历史 id 无效） |
| `405` | 方法不允许 |
| `1008`（WS 关闭码） | `server_id` 缺失或服务器不存在 |

WebSocket 连接失败时，服务端先发 `{"type":"error","message":"Failed to connect to <name>: <原因>"}`，再发 `status: disconnected`。

---

## 6. 环境变量（后端）

| 变量 | 默认 | 说明 |
|---|---|---|
| `WS_DATA_DIR` | `backend/data` | 数据目录（servers/commands/history JSON + 加密密钥） |
| `WS_KNOWN_HOSTS` | `~/.ssh/known_hosts` | Host key 校验文件 |
| `WS_SSH_CONFIG` | `~/.ssh/config` | 导入来源 |

其他可调参数（连接超时 15s、keepalive 30s×3、WS ping 30s、历史上限 2000/500）见 `backend/app/config/settings.py`。
