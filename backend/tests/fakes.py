"""测试用 SSH mock（不依赖真实远程服务器）。

FakeConn / FakeChannel 模仿 asyncssh 的通道与会话接口：
- conn.create_session(factory, **kwargs) 返回 (channel, session_obj)（与 asyncssh 约定一致）
- channel.write / change_terminal_size / close
- conn.close / wait_closed
"""

from __future__ import annotations


class FakeChannel:
    def __init__(self):
        self.writes: list = []
        self.sizes: list = []
        self.closed = False

    def write(self, data):
        self.writes.append(data)

    def change_terminal_size(self, width, height, pixwidth=0, pixheight=0):
        self.sizes.append((width, height))

    def close(self):
        self.closed = True


class FakeConn:
    def __init__(self):
        self.channel = FakeChannel()
        self.session_obj = None
        self.create_kwargs = None
        self.closed = False
        self.wait_closed_calls = 0

    async def create_session(self, factory, **kwargs):
        self.create_kwargs = kwargs
        self.session_obj = factory()
        return self.channel, self.session_obj

    def close(self):
        self.closed = True

    async def wait_closed(self):
        self.wait_closed_calls += 1


class FakeConnector:
    """可注入的 SSH 连接器：每次 connect 返回一个新 FakeConn，或抛出 error。"""

    def __init__(self, error=None):
        self.error = error
        self.calls: list = []
        self.connections: list = []

    async def connect(self, server, secrets, settings):
        self.calls.append((dict(server), dict(secrets)))
        if self.error is not None:
            raise self.error
        conn = FakeConn()
        self.connections.append(conn)
        return conn
