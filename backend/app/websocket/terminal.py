"""WebSocket 终端端点：/ws/terminal?server_id=<uuid>

每个 WebSocket 连接建立独立的 SSH 交互式会话（PTY shell），
消息协议见 CONTRACT.md §4：

客户端 → 服务端：{"type": "input", "data": "..."} / {"type": "resize", "cols": n, "rows": n}
服务端 → 客户端：{"type": "output"|"status"|"error", ...}

连接断开（客户端关闭 / SSH 会话结束 / 连接丢失）时释放对应资源。
"""

from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, WebSocket
from starlette.websockets import WebSocketDisconnect

logger = logging.getLogger(__name__)

router = APIRouter()


def _int_param(value, default: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


async def _reader(websocket: WebSocket, session) -> None:
    """读取客户端消息：input / resize。客户端断开时抛出 WebSocketDisconnect。"""
    while True:
        message = await websocket.receive_json()
        mtype = message.get("type")
        if mtype == "input":
            session.write_input(message.get("data", ""))
        elif mtype == "resize":
            session.resize(message.get("cols", 80), message.get("rows", 24))
        # 其他类型忽略（前向兼容）


async def _writer(websocket: WebSocket, session, send_lock: asyncio.Lock) -> None:
    """消费会话事件队列并发送到 WebSocket；None 哨兵表示事件流结束。"""
    while True:
        event = await session.next_event()
        if event is None:
            return
        async with send_lock:
            await websocket.send_json(event)


async def _cleanup(session, manager, reader, writer, start, websocket) -> None:
    await session.close()
    for task in (reader, writer, start):
        task.cancel()
    for task in (reader, writer, start):
        try:
            await task
        except (asyncio.CancelledError, Exception):
            pass
    manager.remove(session.id)
    try:
        await websocket.close(code=1000)
    except Exception:
        pass


@router.websocket("/ws/terminal")
async def terminal_endpoint(websocket: WebSocket) -> None:
    app = websocket.app
    storage = app.state.storage
    manager = app.state.manager

    server_id = websocket.query_params.get("server_id", "")
    if not server_id:
        await websocket.close(code=1008)
        return

    await websocket.accept()

    server_record = storage.servers.get(server_id)
    if server_record is None:
        await websocket.send_json({"type": "error", "message": f"Server not found: {server_id}"})
        await websocket.close(code=1008)
        return

    secrets = storage.servers.secrets(server_record)
    session = manager.create_session(server_record, secrets)
    logger.info("WebSocket terminal connected server=%s session=%s",
                server_record.get("name"), session.id)

    cols = _int_param(websocket.query_params.get("cols"), 120)
    rows = _int_param(websocket.query_params.get("rows"), 30)
    send_lock = asyncio.Lock()

    reader_task = asyncio.create_task(_reader(websocket, session))
    writer_task = asyncio.create_task(_writer(websocket, session, send_lock))
    start_task = asyncio.create_task(session.start(cols=cols, rows=rows))

    try:
        # 阶段一：等待连接建立完成，或客户端先行断开
        done, _pending = await asyncio.wait(
            {start_task, reader_task}, return_when=asyncio.FIRST_COMPLETED
        )
        if start_task not in done:
            # 客户端在连接建立期间断开
            await _cleanup(session, manager, reader_task, writer_task, start_task, websocket)
            return
        started = start_task.result()
        if not started:
            # 连接失败：错误/状态事件已入队，等待 writer 排空后关闭
            await asyncio.wait({writer_task}, return_when=asyncio.FIRST_COMPLETED)
            await _cleanup(session, manager, reader_task, writer_task, start_task, websocket)
            return
        # 阶段二：正常连接，等待客户端断开或会话结束（writer 收到哨兵退出）
        await asyncio.wait(
            {reader_task, writer_task}, return_when=asyncio.FIRST_COMPLETED
        )
    except asyncio.CancelledError:
        pass
    finally:
        await _cleanup(session, manager, reader_task, writer_task, start_task, websocket)
        logger.info("WebSocket terminal closed server=%s session=%s",
                    server_record.get("name"), session.id)
