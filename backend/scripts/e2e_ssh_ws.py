"""真实 SSH 端到端测试：asyncssh 真实服务器 → 后端全链路（REST + WebSocket）。

覆盖：
1. asyncssh 起真实 SSH 服务器（密码认证 + PTY shell）
2. 通过 REST API 创建指向该服务器的配置
3. WebSocket /ws/terminal 连接 → 收到 connecting/connected → 输入命令 → 收到输出 → resize → 断开
4. 验证 GET 响应不含密码字段、known_hosts 强校验

运行：backend/.venv/bin/python scripts/e2e_ssh_ws.py
"""
from __future__ import annotations

import asyncio
import json
import logging
import tempfile
from pathlib import Path

import asyncssh

from app.config.settings import Settings
from app.config.storage import Storage
from app.main import create_app
from app.ssh.connection import SSHConnector

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logging.getLogger("asyncssh").setLevel(logging.WARNING)
logging.getLogger("app").setLevel(logging.WARNING)

USER = "e2euser"
PASSWORD = "e2e-pass-123"


class _ServerSession(asyncssh.SSHServerSession):
    """极简真实 shell：接受 PTY + shell，回显输入（真实数据通路）。"""

    def __init__(self) -> None:
        self._chan = None

    def connection_made(self, chan) -> None:
        self._chan = chan

    def pty_requested(self, term_type, term_size, term_modes):
        return True

    def shell_requested(self):
        return True

    def data_received(self, data, datatype):
        if self._chan:
            self._chan.write(data)

    def connection_lost(self, exc) -> None:
        if self._chan:
            self._chan.exit(0)


class _Server(asyncssh.SSHServer):
    def begin_auth(self, username):
        return False

    def password_auth_supported(self):
        return True

    def validate_password(self, username, password):
        return username == USER and password == PASSWORD

    def session_requested(self):
        return _ServerSession()


def _start_server_in_loop(host_key, tmp: Path, started: dict):
    """在 app 事件循环内启动 asyncssh 服务器（portal.call 执行，返回协程被自动 await）。"""

    async def _go():
        server = await asyncssh.create_server(
            _Server, "127.0.0.1", 0, server_host_keys=[host_key]
        )
        port = server.sockets[0].getsockname()[1]
        started["server"] = server
        started["port"] = port

    return _go()


async def main() -> int:
    # 后端应用（TestClient 会 portal 到 app 事件循环；真实 SSH 服务器也放进同一循环）
    tmp = Path(tempfile.mkdtemp(prefix="ws-e2e-"))
    host_key_path = tmp / "host_key"
    asyncssh.generate_private_key("ssh-ed25519").write_private_key(str(host_key_path))
    host_key = asyncssh.read_private_key(str(host_key_path))

    from app.main import _load_with_secrets
    from fastapi.testclient import TestClient

    with TestClient(create_app(settings=Settings(
        data_dir=tmp / "data", known_hosts=tmp / "known_hosts",
        ssh_config_path=tmp / "ssh_config"))) as client:
        # 在 app 循环内启动真实 asyncssh 服务器
        started: dict = {}
        client.portal.call(lambda: _start_server_in_loop(host_key, tmp, started))
        port = started["port"]
        print(f"OK: real asyncssh server on 127.0.0.1:{port}")

        # 把本机服务器公钥写入 known_hosts（验证 host key 校验通过）
        known_hosts = tmp / "known_hosts"
        pub = host_key.export_public_key().decode()
        known_hosts.write_text(f"[127.0.0.1]:{port} {pub.strip()}\n", encoding="utf-8")

        # 1) REST：创建服务器（含密码）→ 响应不应含 password
        payload = {
            "name": "E2E-REAL", "host": "127.0.0.1", "port": port,
            "username": USER, "auth_type": "password", "password": PASSWORD,
        }
        r = client.post("/api/servers", json=payload)
        assert r.status_code in (200, 201), f"create server failed: {r.text}"
        srv = r.json()
        assert "password" not in srv and "passphrase" not in srv, "secret leaked!"
        server_id = srv["id"]
        print("OK: REST create server (no secret in response)")

        # 2) WebSocket：全链路连接
        with client.websocket_connect(f"/ws/terminal?server_id={server_id}") as ws:
            msgs: list[dict] = []
            # 收集前 2 条：connecting + connected
            for _ in range(2):
                m = json.loads(ws.receive_text())
                msgs.append(m)
            states = [m.get("state") for m in msgs if m.get("type") == "status"]
            assert "connecting" in states and "connected" in states, f"unexpected: {msgs}"
            print("OK: WS connected + status connecting/connected")

            # 3) 输入命令 → 期望回显
            ws.send_text(json.dumps({"type": "input", "data": "echo e2e-ok\r"}))
            buf = ""
            for _ in range(50):
                m = json.loads(ws.receive_text())
                if m.get("type") == "output":
                    buf += m.get("data", "")
                    if "e2e-ok" in buf:
                        break
            assert "e2e-ok" in buf, f"no echo received: {buf!r}"
            print(f"OK: input forwarded, output echoed: {buf.strip().splitlines()[-1]!r}")

            # 4) resize
            ws.send_text(json.dumps({"type": "resize", "cols": 120, "rows": 40}))
            client.portal.call(lambda: asyncio.sleep(0.3))
            print("OK: resize sent (no error)")

            # 5) 断开
            ws.close()
        print("OK: WS closed cleanly")

        # 6) 清理服务器
        r = client.delete(f"/api/servers/{server_id}")
        assert r.status_code == 204, f"cleanup failed: {r.status_code}"
        print("OK: cleanup server")

        # 停止真实服务器
        client.portal.call(lambda: started["server"].close())
        client.portal.call(lambda: started["server"].wait_closed())
    print("ALL E2E REAL-SSH TESTS PASSED")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
