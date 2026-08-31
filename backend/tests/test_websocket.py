"""WebSocket 终端测试（CONTRACT.md §4，SSH 使用 mock）。

覆盖：连接建立（status 状态机）、输入转发、resize、输出返回、
正常关闭、异常断开（SSH 连接丢失）、未知服务器、连接失败、多会话隔离。
"""

from __future__ import annotations

import time

import asyncssh
import pytest
from fastapi.testclient import TestClient

from app.config.settings import Settings
from app.main import create_app
from tests.fakes import FakeConnector


def make_app(tmp_path, connector):
    settings = Settings(
        data_dir=tmp_path / "data",
        known_hosts=tmp_path / "known_hosts",
        ssh_config_path=tmp_path / "ssh_config",
    )
    return create_app(settings=settings, connector=connector)


def wait_until(cond, timeout=5.0):
    deadline = time.time() + timeout
    while time.time() < deadline:
        if cond():
            return True
        time.sleep(0.02)
    raise AssertionError("condition not met within timeout")


def create_server(client, **overrides):
    payload = {
        "name": "DEV-01", "host": "10.0.0.1", "port": 22,
        "username": "developer", "auth_type": "password",
        "password": "s3cret", **overrides,
    }
    resp = client.post("/api/servers", json=payload)
    assert resp.status_code == 201, resp.text
    return resp.json()


def first_session(app):
    return next(iter(app.state.manager._sessions.values()))


@pytest.fixture()
def connector():
    return FakeConnector()


@pytest.fixture()
def client(tmp_path, connector):
    app = make_app(tmp_path, connector)
    with TestClient(app) as c:
        yield c


# ---------------------------------------------------------------- 连接建立


def test_ws_connect_status_and_pty(client, connector):
    server_id = create_server(client)["id"]
    with client.websocket_connect(f"/ws/terminal?server_id={server_id}") as ws:
        assert ws.receive_json() == {"type": "status", "state": "connecting"}
        assert ws.receive_json() == {"type": "status", "state": "connected"}
        conn = connector.connections[-1]
        assert conn.create_kwargs["term_type"] == "xterm"
        assert conn.create_kwargs["term_size"] == (120, 30)
    # 断开后会话与资源释放
    assert client.app.state.manager.active_count == 0


def test_ws_unknown_server(client):
    with client.websocket_connect("/ws/terminal?server_id=does-not-exist") as ws:
        assert ws.receive_json() == {"type": "error",
                                     "message": "Server not found: does-not-exist"}
        with pytest.raises(Exception):
            ws.receive_json()  # 服务端随后关闭连接


def test_ws_missing_server_id(client):
    with pytest.raises(Exception):
        with client.websocket_connect("/ws/terminal"):
            pass


def test_ws_connect_failure_emits_error(client, connector):
    connector.error = asyncssh.PermissionDenied("denied", "en-US")
    server_id = create_server(client)["id"]
    with client.websocket_connect(f"/ws/terminal?server_id={server_id}") as ws:
        assert ws.receive_json() == {"type": "status", "state": "connecting"}
        msg = ws.receive_json()
        assert msg["type"] == "error"
        assert "Failed to connect to DEV-01" in msg["message"]
        assert ws.receive_json() == {"type": "status", "state": "disconnected"}
        with pytest.raises(Exception):
            ws.receive_json()
    assert client.app.state.manager.active_count == 0


# ---------------------------------------------------------------- 输入 / 输出


def test_ws_input_forwarding(client, connector):
    server_id = create_server(client)["id"]
    with client.websocket_connect(f"/ws/terminal?server_id={server_id}") as ws:
        ws.receive_json()
        ws.receive_json()
        conn = connector.connections[-1]
        ws.send_json({"type": "input", "data": "ls -la\r"})
        ws.send_json({"type": "input", "data": "echo hi\n"})
        wait_until(lambda: client.portal.call(lambda: list(conn.channel.writes))
                   == ["ls -la\r", "echo hi\n"])


def test_ws_resize_forwarding(client, connector):
    server_id = create_server(client)["id"]
    with client.websocket_connect(f"/ws/terminal?server_id={server_id}") as ws:
        ws.receive_json()
        ws.receive_json()
        conn = connector.connections[-1]
        ws.send_json({"type": "resize", "cols": 140, "rows": 40})
        wait_until(lambda: client.portal.call(lambda: list(conn.channel.sizes)) == [(140, 40)])


def test_ws_output_returned(client):
    server_id = create_server(client)["id"]
    with client.websocket_connect(f"/ws/terminal?server_id={server_id}") as ws:
        ws.receive_json()
        ws.receive_json()
        session = first_session(client.app)
        client.portal.call(session._on_data, "hello\r\n")
        assert ws.receive_json() == {"type": "output", "data": "hello\r\n"}
        client.portal.call(session._on_data, "ANSI \x1b[32mgreen\x1b[0m\n")
        assert ws.receive_json() == {"type": "output", "data": "ANSI \x1b[32mgreen\x1b[0m\n"}


# ---------------------------------------------------------------- 关闭 / 异常


def test_ws_normal_close_releases_session(client):
    server_id = create_server(client)["id"]
    with client.websocket_connect(f"/ws/terminal?server_id={server_id}") as ws:
        ws.receive_json()
        ws.receive_json()
        assert client.app.state.manager.active_count == 1
    # 正常关闭后：SSH 会话释放、连接关闭、从管理器移除
    assert client.app.state.manager.active_count == 0


def test_ws_connection_lost(client):
    server_id = create_server(client)["id"]
    with client.websocket_connect(f"/ws/terminal?server_id={server_id}") as ws:
        ws.receive_json()
        ws.receive_json()
        session = first_session(client.app)
        client.portal.call(session._on_connection_lost,
                           asyncssh.ConnectionLost("boom", "en-US"))
        msgs = [ws.receive_json(), ws.receive_json()]
        assert any(m["type"] == "error" and "Connection lost" in m["message"] for m in msgs)
        assert msgs[-1] == {"type": "status", "state": "disconnected"}
        with pytest.raises(Exception):
            ws.receive_json()  # 服务端关闭连接
    assert client.app.state.manager.active_count == 0


def test_ws_remote_shell_exit(client):
    server_id = create_server(client)["id"]
    with client.websocket_connect(f"/ws/terminal?server_id={server_id}") as ws:
        ws.receive_json()
        ws.receive_json()
        session = first_session(client.app)
        client.portal.call(session._on_connection_lost, None)  # 远程 exit
        assert ws.receive_json() == {"type": "status", "state": "disconnected"}
        with pytest.raises(Exception):
            ws.receive_json()


# ---------------------------------------------------------------- 多会话


def test_ws_multiple_sessions_independent(client, connector):
    sid1 = create_server(client)["id"]
    sid2 = create_server(client, name="DEV-02", host="10.0.0.2")["id"]
    with client.websocket_connect(f"/ws/terminal?server_id={sid1}") as ws1, \
         client.websocket_connect(f"/ws/terminal?server_id={sid2}") as ws2:
        ws1.receive_json()
        ws1.receive_json()
        ws2.receive_json()
        ws2.receive_json()
        assert client.app.state.manager.active_count == 2
        conn1, conn2 = connector.connections[0], connector.connections[1]
        ws1.send_json({"type": "input", "data": "a\r"})
        ws2.send_json({"type": "input", "data": "b\r"})
        wait_until(lambda: client.portal.call(lambda: list(conn1.channel.writes)) == ["a\r"])
        wait_until(lambda: client.portal.call(lambda: list(conn2.channel.writes)) == ["b\r"])
        # 单独关闭一个，另一个不受影响
    assert client.app.state.manager.active_count == 0


def test_ws_one_session_failure_does_not_affect_others(client, connector):
    server_id = create_server(client)["id"]
    with client.websocket_connect(f"/ws/terminal?server_id={server_id}") as ws:
        ws.receive_json()
        ws.receive_json()
        session = first_session(client.app)
        # 会话 1 异常断开
        client.portal.call(session._on_connection_lost, asyncssh.ConnectionLost("boom", "en-US"))
        msgs = [ws.receive_json(), ws.receive_json()]
        assert any(m["type"] == "error" for m in msgs)
        with pytest.raises(Exception):
            ws.receive_json()
    # 之后新连接仍然正常
    server_id2 = create_server(client, name="OK-01", host="10.0.0.9")["id"]
    with client.websocket_connect(f"/ws/terminal?server_id={server_id2}") as ws2:
        assert ws2.receive_json() == {"type": "status", "state": "connecting"}
        assert ws2.receive_json() == {"type": "status", "state": "connected"}
