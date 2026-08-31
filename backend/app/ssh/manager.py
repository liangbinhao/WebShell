"""多会话管理器：管理所有活动 SSH 会话的生命周期。

- 每个 WebSocket 连接注册一个独立 SSHSession（uuid 标识）；
- 单个会话异常不影响其他会话；
- 服务关闭 / 删除服务器时统一释放相关会话。
"""

from __future__ import annotations

import asyncio
import logging
import uuid

from .session import SSHSession

logger = logging.getLogger(__name__)


class SessionManager:
    def __init__(self, connector, settings):
        self._connector = connector
        self._settings = settings
        self._sessions: dict[str, SSHSession] = {}

    def create_session(self, server: dict, secrets: dict) -> SSHSession:
        session = SSHSession(uuid.uuid4().hex, server, secrets,
                             self._connector, self._settings)
        self._sessions[session.id] = session
        logger.info("Session created id=%s server=%s (active=%d)",
                    session.id, server.get("name"), len(self._sessions))
        return session

    def get(self, session_id: str) -> SSHSession | None:
        return self._sessions.get(session_id)

    def remove(self, session_id: str) -> None:
        self._sessions.pop(session_id, None)
        logger.info("Session removed id=%s (active=%d)", session_id, len(self._sessions))

    async def close_by_server(self, server_id: str) -> None:
        """关闭某个服务器的所有活动会话（删除服务器时调用）。"""
        targets = [s for s in self._sessions.values() if s.server.get("id") == server_id]
        for session in targets:
            logger.info("Closing session id=%s of server %s", session.id, server_id)
            await session.close()

    async def close_all(self) -> None:
        sessions = list(self._sessions.values())
        for session in sessions:
            await session.close()
        self._sessions.clear()

    @property
    def active_count(self) -> int:
        return len(self._sessions)
