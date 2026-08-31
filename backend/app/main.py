"""FastAPI 入口：挂载 REST 路由与 WebSocket 端点。

启动：``uvicorn app.main:app --host 127.0.0.1 --port 8000``（在 backend/ 目录下）
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api import commands as commands_api
from .api import history as history_api
from .api import servers as servers_api
from .config.settings import Settings
from .config.storage import Storage
from .ssh.connection import SSHConnector
from .ssh.manager import SessionManager
from .websocket import terminal as terminal_ws

logger = logging.getLogger(__name__)

_logging_configured = False


def _configure_logging() -> None:
    global _logging_configured
    if _logging_configured:
        return
    _logging_configured = True
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    # 减少 asyncssh 内部日志噪音（不影响连接成功/失败等关键日志）
    logging.getLogger("asyncssh").setLevel(logging.WARNING)


def _load_with_secrets(storage: Storage):
    """id -> (record, secrets)；用于跳板机解析与解密。"""

    def load(server_id: str):
        record = storage.servers.get(server_id)
        if record is None:
            return None
        return record, storage.servers.secrets(record)

    return load


def create_app(settings: Optional[Settings] = None,
               connector: Optional[SSHConnector] = None) -> FastAPI:
    """应用工厂。settings / connector 可注入（测试用）。"""
    _configure_logging()
    settings = settings or Settings.from_env()
    storage = Storage.init(settings)

    if connector is None:
        connector = SSHConnector(_load_with_secrets(storage))

    manager = SessionManager(connector=connector, settings=settings)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        logger.info("Web SSH Workspace backend started (data dir: %s)", settings.data_dir)
        try:
            yield
        finally:
            await manager.close_all()
            logger.info("Web SSH Workspace backend stopped")

    app = FastAPI(title="Web SSH Workspace", version="0.1.0", lifespan=lifespan)
    app.state.settings = settings
    app.state.storage = storage
    app.state.manager = manager
    app.state.connector = connector

    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex=settings.cors_allow_origin_regex,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(servers_api.router)
    app.include_router(commands_api.router)
    app.include_router(history_api.router)
    app.include_router(terminal_ws.router)

    @app.get("/api/health")
    async def health():
        return {"status": "ok"}

    return app


app = create_app()
