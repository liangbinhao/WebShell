"""本地集成冒烟测试：用 asyncssh 起一个本机 SSH 服务器（密码认证），
用真实 SSHSession 连接验证 交互式 PTY shell / 输入 / 输出 / resize / 关闭。

仅作为开发期验证脚本，不属于 pytest 测试套件。
运行：.venv/bin/python scripts/smoke_ssh_local.py
"""

from __future__ import annotations

import asyncio
import logging
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import asyncssh  # noqa: E402

from app.config.settings import Settings  # noqa: E402
from app.ssh.session import SSHSession  # noqa: E402
from tests.fakes import FakeConnector  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logging.getLogger("asyncssh").setLevel(logging.WARNING)

USER = "smokeuser"
PASSWORD = "smoke-pass-123"
SERVER_RECORD = {
    "id": "local", "name": "LOCAL", "host": "127.0.0.1", "port": 0,
    "username": USER, "auth_type": "password", "proxy_jump": [],
}
SECRETS = {"password": PASSWORD, "passphrase": ""}


class _ServerSession(asyncssh.SSHServerSession):
    """极简 shell 会话：接受 PTY + shell，并把输入回显（便于验证数据通路）。"""

    def __init__(self):
        self._chan = None

    def connection_made(self, chan):
        self._chan = chan

    def pty_requested(self, term_type, term_size, term_modes):
        return True

    def shell_requested(self):
        return True

    def data_received(self, data, datatype):
        self._chan.write(data)  # echo


class _Server(asyncssh.SSHServer):
    def begin_auth(self, username):
        return False  # 继续下一个认证方法

    def password_auth_supported(self):
        return True

    def validate_password(self, username, password):
        return username == USER and password == PASSWORD

    def session_requested(self):
        return _ServerSession()


async def main() -> int:
    tmp = Path(tempfile.mkdtemp(prefix="ws-smoke-"))
    host_key_path = tmp / "host_key"
    asyncssh.generate_private_key("ssh-ed25519").write_private_key(str(host_key_path))
    host_key = asyncssh.read_private_key(str(host_key_path))

    server = await asyncssh.create_server(_Server, "127.0.0.1", 0,
                                          server_host_keys=[host_key])
    port = server.sockets[0].getsockname()[1]
    record = {**SERVER_RECORD, "port": port}

    settings = Settings(data_dir=tmp / "data", known_hosts=tmp / "known_hosts",
                        ssh_config_path=tmp / "ssh_config")
    # 把本机服务器公钥写入 known_hosts，验证 host key 校验链路
    known_hosts_path = settings.known_hosts
    known_hosts_path.parent.mkdir(parents=True, exist_ok=True)
    pub = host_key.export_public_key().decode()  # openssh 格式
    known_hosts_path.write_text(f"[127.0.0.1]:{port} {pub.strip()}\n", encoding="utf-8")

    class _RealConnector(FakeConnector):
        """用真实 asyncssh.connect 连接本地服务器。"""

        async def connect(self, server, secrets, settings):
            from app.ssh.connection import build_connect_options
            opts = build_connect_options(server, secrets, settings)
            return await asyncssh.connect(server["host"], server["port"], **opts)

    session = SSHSession("smoke-1", record, SECRETS, _RealConnector(), settings)

    ok = await session.start(cols=100, rows=30)
    assert ok, "session start failed"
    st = [await session.next_event(), await session.next_event()]
    assert st == [{"type": "status", "state": "connecting"},
                  {"type": "status", "state": "connected"}]
    print("OK: connected + PTY shell")

    async def collect_until(predicate, timeout=5.0):
        buf = ""
        while timeout > 0:
            ev = await asyncio.wait_for(session.next_event(), timeout)
            timeout -= 0.1
            if ev["type"] == "output":
                buf += ev["data"]
                if predicate(buf):
                    return buf
        raise AssertionError(f"timeout waiting for output; got {buf!r}")

    # 输入 → 输出
    session.write_input("echo hello-from-smoke\r")
    out = await collect_until(lambda b: "hello-from-smoke" in b)
    print("OK: input forwarded, output received:", out.strip().splitlines()[-1])

    # resize
    session.resize(120, 40)
    await asyncio.sleep(0.2)
    print("OK: resize sent (no error)")

    # 正常关闭
    await session.close()
    assert session._closed
    print("OK: session closed cleanly")

    server.close()
    await server.wait_closed()
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
