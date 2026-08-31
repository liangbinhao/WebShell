"""SSH 测试（mock，不依赖真实远程服务器）。

覆盖：正常登录、登录失败、PTY 创建、输入转发、resize、
Session 关闭、Connection lost、跳板机链、Host key 校验策略。
"""

from __future__ import annotations

import asyncio

import asyncssh
import pytest

from app.config.settings import Settings
from app.ssh.connection import (
    SSHConnector,
    ServerConfigError,
    build_connect_options,
    ensure_known_hosts_file,
    friendly_connect_error,
)
from app.ssh.session import SSHSession
from tests.fakes import FakeConn, FakeConnector

SERVER = {
    "id": "s1", "name": "DEV-01", "host": "10.0.0.1", "port": 22,
    "username": "developer", "auth_type": "password", "proxy_jump": [],
}
SECRETS = {"password": "s3cret", "passphrase": ""}


@pytest.fixture()
def settings(tmp_path):
    return Settings(
        data_dir=tmp_path / "data",
        known_hosts=tmp_path / "known_hosts",
        ssh_config_path=tmp_path / "ssh_config",
    )


async def drain(session) -> list:
    """读取事件直到 None 哨兵（仅用于会话已结束的场景）。"""
    events = []
    while True:
        ev = await session.next_event()
        if ev is None:
            return events
        events.append(ev)


async def read_events(session, n: int) -> list:
    return [await session.next_event() for _ in range(n)]


# ---------------------------------------------------------------- 会话


async def test_normal_login_and_pty(settings):
    connector = FakeConnector()
    session = SSHSession("sid-1", SERVER, SECRETS, connector, settings)
    ok = await session.start(cols=120, rows=30)
    assert ok is True
    conn = connector.connections[0]
    # PTY / 交互式 shell：term_type + term_size 正确传递
    assert conn.create_kwargs["term_type"] == "xterm"
    assert conn.create_kwargs["term_size"] == (120, 30)
    assert conn.create_kwargs["encoding"] == "utf-8"
    events = await read_events(session, 2)
    assert events == [{"type": "status", "state": "connecting"},
                      {"type": "status", "state": "connected"}]
    await session.close()


async def test_login_failure_emits_error(settings):
    connector = FakeConnector(error=asyncssh.PermissionDenied("denied", "en-US"))
    session = SSHSession("sid-2", SERVER, SECRETS, connector, settings)
    ok = await session.start()
    assert ok is False
    events = await drain(session)
    assert events[0] == {"type": "status", "state": "connecting"}
    error = next(e for e in events if e["type"] == "error")
    assert "Failed to connect to DEV-01" in error["message"]
    assert "认证失败" in error["message"]
    assert events[-1] == {"type": "status", "state": "disconnected"}
    assert session._closed is True


async def test_input_forwarding(settings):
    connector = FakeConnector()
    session = SSHSession("sid-3", SERVER, SECRETS, connector, settings)
    await session.start()
    session.write_input("ls -la\r")
    session.write_input("echo hi\n")
    assert connector.connections[0].channel.writes == ["ls -la\r", "echo hi\n"]
    await session.close()


async def test_input_after_close_ignored(settings):
    connector = FakeConnector()
    session = SSHSession("sid-4", SERVER, SECRETS, connector, settings)
    await session.start()
    conn = connector.connections[0]
    await session.close()
    session.write_input("ignored\r")
    assert conn.channel.writes == []


async def test_resize(settings):
    connector = FakeConnector()
    session = SSHSession("sid-5", SERVER, SECRETS, connector, settings)
    await session.start()
    session.resize(140, 40)
    assert connector.connections[0].channel.sizes == [(140, 40)]
    await session.close()


async def test_session_close_releases_connection(settings):
    connector = FakeConnector()
    session = SSHSession("sid-6", SERVER, SECRETS, connector, settings)
    await session.start()
    conn = connector.connections[0]
    assert conn.closed is False
    await session.close()
    assert conn.closed is True
    assert session._closed is True
    events = await drain(session)
    assert events[-1] == {"type": "status", "state": "disconnected"}
    # close 幂等
    await session.close()


async def test_connection_lost_emits_error_and_releases(settings):
    connector = FakeConnector()
    session = SSHSession("sid-7", SERVER, SECRETS, connector, settings)
    await session.start()
    conn = connector.connections[0]
    # 模拟 asyncssh 回调：连接丢失
    session._on_connection_lost(asyncssh.ConnectionLost("boom", "en-US"))
    await session.close()  # 等待清理任务完成
    assert conn.closed is True
    events = await drain(session)
    error = next(e for e in events if e["type"] == "error")
    assert "Connection lost" in error["message"]
    assert events[-1] == {"type": "status", "state": "disconnected"}


async def test_remote_shell_exit(settings):
    connector = FakeConnector()
    session = SSHSession("sid-8", SERVER, SECRETS, connector, settings)
    await session.start()
    # 远程 shell 正常退出：connection_lost(None)
    session._on_connection_lost(None)
    await session.close()
    events = await drain(session)
    assert not any(e["type"] == "error" for e in events)
    assert events[-1] == {"type": "status", "state": "disconnected"}


async def test_output_callback(settings):
    connector = FakeConnector()
    session = SSHSession("sid-9", SERVER, SECRETS, connector, settings)
    await session.start()
    await read_events(session, 2)  # connecting / connected
    session._on_data("hello\r\n")
    session._on_data("\x1b[31mred\x1b[0m")
    events = await read_events(session, 2)
    assert events[0] == {"type": "output", "data": "hello\r\n"}
    assert events[1] == {"type": "output", "data": "\x1b[31mred\x1b[0m"}
    await session.close()


# ---------------------------------------------------------------- 连接选项


async def test_host_key_verification_never_disabled(settings):
    opts = build_connect_options(SERVER, SECRETS, settings)
    assert opts.get("known_hosts") is not None  # 绝不能传 None 关闭校验
    kh = ensure_known_hosts_file(settings.known_hosts)
    assert kh.exists()
    assert (kh.stat().st_mode & 0o777) == 0o600


async def test_build_options_key_auth(settings):
    server = {**SERVER, "auth_type": "key", "key_path": "/tmp/id_rsa"}
    opts = build_connect_options(server, {"password": "", "passphrase": "pp"}, settings)
    assert opts["client_keys"] == ["/tmp/id_rsa"]
    assert opts["passphrase"] == "pp"
    assert "password" not in opts


async def test_build_options_password_auth(settings):
    opts = build_connect_options(SERVER, SECRETS, settings)
    assert opts["password"] == "s3cret"
    assert "client_keys" not in opts


async def test_build_options_missing_username(settings):
    with pytest.raises(ServerConfigError):
        build_connect_options({**SERVER, "username": ""}, SECRETS, settings)


async def test_build_options_missing_password(settings):
    with pytest.raises(ServerConfigError):
        build_connect_options(SERVER, {"password": "", "passphrase": ""}, settings)


async def test_build_options_missing_key_path(settings):
    with pytest.raises(ServerConfigError):
        build_connect_options({**SERVER, "auth_type": "key", "key_path": ""},
                              {"password": "", "passphrase": ""}, settings)


async def test_keepalive_options_set(settings):
    opts = build_connect_options(SERVER, SECRETS, settings)
    assert opts["keepalive_interval"] > 0
    assert opts["keepalive_count_max"] > 0


def test_friendly_error_mapping():
    msg = friendly_connect_error(asyncssh.PermissionDenied("denied", "en-US"), SERVER)
    assert "Failed to connect to DEV-01" in msg and "认证失败" in msg
    msg2 = friendly_connect_error(ServerConfigError("未配置密码"), SERVER)
    assert "未配置密码" in msg2
    msg3 = friendly_connect_error(OSError(61, "refused"), SERVER)
    assert "网络错误" in msg3


# ---------------------------------------------------------------- 跳板机


async def test_proxy_jump_single_hop(settings, monkeypatch):
    jump = {"id": "j1", "name": "J1", "host": "jump1", "port": 22,
            "username": "ops", "auth_type": "password", "proxy_jump": []}
    target = {**SERVER, "proxy_jump": ["j1"]}
    connector = SSHConnector(lambda sid: (jump, {"password": "jp", "passphrase": ""}) if sid == "j1" else None)

    calls, conns = [], []

    async def fake_connect(host, port, **kwargs):
        conn = FakeConn()
        conns.append(conn)
        calls.append((host, port, kwargs))
        return conn

    monkeypatch.setattr("app.ssh.connection.asyncssh.connect", fake_connect)
    result = await connector.connect(target, SECRETS, settings)
    assert len(calls) == 2
    # 先跳板后目标
    assert calls[0][:2] == ("jump1", 22)
    assert calls[1][:2] == ("10.0.0.1", 22)
    # 目标通过跳板连接
    assert calls[1][2]["tunnel"] is conns[0]
    assert result is conns[1]


async def test_proxy_jump_multi_hop(settings, monkeypatch):
    jumps = {
        "j1": {"id": "j1", "name": "J1", "host": "j1", "username": "u1",
               "auth_type": "password", "proxy_jump": []},
        "j2": {"id": "j2", "name": "J2", "host": "j2", "username": "u2",
               "auth_type": "password", "proxy_jump": []},
    }
    target = {**SERVER, "proxy_jump": ["j1", "j2"]}
    connector = SSHConnector(lambda sid: (jumps[sid], {"password": "p", "passphrase": ""}))

    calls, conns = [], []

    async def fake_connect(host, port, **kwargs):
        conn = FakeConn()
        conns.append(conn)
        calls.append((host, port, kwargs))
        return conn

    monkeypatch.setattr("app.ssh.connection.asyncssh.connect", fake_connect)
    await connector.connect(target, SECRETS, settings)
    assert len(calls) == 3
    assert calls[0][2].get("tunnel") is None
    assert calls[1][2]["tunnel"] is conns[0]
    assert calls[2][2]["tunnel"] is conns[1]


async def test_proxy_jump_target_failure_closes_chain(settings, monkeypatch):
    jump = {"id": "j1", "name": "J1", "host": "jump1", "username": "ops",
            "auth_type": "password", "proxy_jump": []}
    target = {**SERVER, "proxy_jump": ["j1"]}
    connector = SSHConnector(lambda sid: (jump, {"password": "jp", "passphrase": ""}))

    conns = []

    async def fake_connect(host, port, **kwargs):
        conn = FakeConn()
        conns.append(conn)
        if host == "10.0.0.1":
            raise asyncssh.PermissionDenied("denied", "en-US")
        return conn

    monkeypatch.setattr("app.ssh.connection.asyncssh.connect", fake_connect)
    with pytest.raises(asyncssh.PermissionDenied):
        await connector.connect(target, SECRETS, settings)
    assert conns[0].closed is True  # 已建立的跳板连接被关闭


async def test_proxy_jump_missing_server(settings):
    connector = SSHConnector(lambda sid: None)
    target = {**SERVER, "proxy_jump": ["nope"]}
    with pytest.raises(ServerConfigError):
        await connector.connect(target, SECRETS, settings)


async def test_proxy_jump_self_reference_no_recursion(settings, monkeypatch):
    # 自引用不构成无限递归（跳板直连，忽略其自身 proxy_jump）
    target = {**SERVER, "proxy_jump": ["s1"]}
    connector = SSHConnector(lambda sid: (SERVER, SECRETS))

    calls = []

    async def fake_connect(host, port, **kwargs):
        calls.append(host)
        return FakeConn()

    monkeypatch.setattr("app.ssh.connection.asyncssh.connect", fake_connect)
    await connector.connect(target, SECRETS, settings)
    # 跳板（自引用，直连一次）+ 目标 = 共 2 次，无递归
    assert calls == ["10.0.0.1", "10.0.0.1"]
