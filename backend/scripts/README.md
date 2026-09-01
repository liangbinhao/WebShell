# scripts/ 说明与 SSH 测试备忘

本目录包含开发期验证脚本。本文档压缩了此前"本地真实 SSH 服务器"的实现探索结论，避免重复踩坑。

## 脚本一览

| 脚本 | 用途 | 状态 |
|---|---|---|
| `e2e_ssh_ws.py` | **推荐**。asyncssh 起临时真实 SSH 服务器 → REST 建配置 → WebSocket 全链路（连接/认证/PTY/收发/resize/断开） | ✅ 已验证通过，自清理 |
| `smoke_ssh_local.py` | 本地 SSH 集成冒烟（开发期，直接测 SSHSession） | ✅ 可用 |

运行：

```bash
cd backend
PYTHONPATH=. uv run python scripts/e2e_ssh_ws.py
PYTHONPATH=. uv run python scripts/smoke_ssh_local.py
```

## ⚠️ 重要结论：不要再尝试做"常驻本地 SSH 服务器"

此前尝试实现 `dev_ssh_server.py`（asyncssh 常驻服务器 + 真实命令执行，供 Web UI 手动连接测试），**未成功，已删除**。结论如下：

### 已验证可行（可作为参照模板）

- **SSHServerSession 子类 + `asyncssh.create_server`**：连接、认证、PTY、**纯回显**（`data_received` 里直接 `self.c.write(data)`）全部正常。
- e2e 脚本就是基于该模式的完整可用实现。

### 失败点（不要重复尝试）

1. **`data_received` 里用 `asyncio.ensure_future` / `create_task` 执行命令** → WebSocket 连接在 connecting 后即断开。
2. **`data_received` 里同步 `subprocess.run` 执行命令** → 同样断开（阻塞事件循环回调）。
3. **`session_requested` 返回流式 handler `(stdin, stdout, stderr)` + asyncio subprocess 桥接** → 通道建立后立即关闭。
4. **`SSHServerProcess` 子类 + `create_process`** → asyncssh 2.24 服务器侧**无** `create_process` API。

**根因方向**：asyncssh 服务器会话在 TestClient/独立事件循环下，命令执行的子进程桥接与本环境（macOS 沙箱，`openpty` 被禁、child watcher 受限）不兼容；纯回显（同步写）是唯一稳定路径。**不要在真实 SSH 命令执行桥接上继续投入**。

## 推荐的本地真实 SSH 测试方式

1. **快速验证链路**：跑 `e2e_ssh_ws.py`（自动起真实 SSH 服务器 + 全链路断言）。
2. **在 Web UI 里手动体验**：用局域网内一台开了 OpenSSH Server 的机器（如 Windows：`Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0` + `Start-Service sshd`），在 Web SSH 里添加真实服务器连接。比模拟服务器更真实，还能顺带验证跨平台 SSH 兼容性与中文编码。
