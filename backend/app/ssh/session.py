"""单个交互式 SSH 会话（PTY shell）封装。

每个 WebSocket 连接对应一个独立 SSHSession。会话通过事件队列向外发送
status / output / error 事件（消息格式见 CONTRACT.md §4），并以 None
作为事件流结束哨兵。

生命周期：start() 建立连接并创建 PTY shell → 输入/输出/调整大小 →
close() 或远程断开（connection_lost）→ 释放连接资源。
"""

from __future__ import annotations

import asyncio
import logging
from typing import Optional

import asyncssh

from .connection import SSHConnector, friendly_connect_error

logger = logging.getLogger(__name__)


class _SessionBridge:
    """把 asyncssh 会话回调桥接到 SSHSession（避免闭包捕获问题）。"""

    def __init__(self, session: "SSHSession"):
        self._session = session

    def feed(self, data) -> None:
        self._session._on_data(data)

    def lost(self, exc) -> None:
        self._session._on_connection_lost(exc)


class _TerminalClientSession(asyncssh.SSHClientSession):
    def __init__(self, bridge: _SessionBridge):
        self._bridge = bridge

    def data_received(self, data, datatype) -> None:
        # 交互式 PTY 下 stdout/stderr 已合并；此处统一转发
        self._bridge.feed(data)

    def connection_lost(self, exc) -> None:
        self._bridge.lost(exc)


class SSHSession:
    """一个 WebSocket 连接对应一个独立 SSH 会话（交互式 PTY shell）。"""

    def __init__(self, session_id: str, server: dict, secrets: dict,
                 connector: SSHConnector, settings):
        self.id = session_id
        self.server = server
        self._secrets = secrets
        self._connector = connector
        self._settings = settings
        self._queue: asyncio.Queue = asyncio.Queue()
        self._conn: Optional[object] = None
        self._channel: Optional[object] = None
        self._closed = False
        self._cleanup_task: Optional[asyncio.Task] = None
        # 会话建立前收到的 resize 暂存，channel 就绪后补发
        # （前端 ws.onopen 即发 resize，此时会话尚在 connecting，直接丢会导致
        #  远端 ConPTY/cmd 保持默认尺寸，与 xterm 实际尺寸不一致 → ↑ 历史跳行）
        self._pending_resize: Optional[tuple[int, int]] = None

    # ------------------------------------------------------------- 事件流

    def emit(self, event) -> None:
        """向事件队列写入一个事件（None 为结束哨兵）。"""
        self._queue.put_nowait(event)

    async def next_event(self):
        """供 WebSocket writer 消费的下一个事件。"""
        return await self._queue.get()

    # ------------------------------------------------------------- 生命周期

    # OpenSSH 客户端请求 PTY 时发送的标准终端模式（RFC 4254 §8 opcode）。
    # asyncssh 默认不发送 term_modes——Windows sshd 收到空模式时不会正确初始化
    # 远端控制台（影响 PSReadLine 的方向键历史等），补上与 OpenSSH 一致的模式
    # 可让远端 shell 行为与原生 ssh 一致。
    _DEFAULT_TERM_MODES = {
        1: 3,    # VINTR   (Ctrl+C)
        2: 28,   # VQUIT   (Ctrl+\)
        3: 127,  # VERASE  (Backspace)
        4: 21,   # VKILL
        5: 4,    # VEOF    (Ctrl+D)
        8: 17,   # VSTART
        9: 19,   # VSTOP
        10: 26,  # VSUSP
        13: 23,  # WERASE
        36: 1,   # ICRNL
        50: 1,   # ISIG
        51: 1,   # ICANON
        53: 1,   # ECHO
        54: 1,   # ECHOE
        55: 1,   # ECHOK
        59: 1,   # IEXTEN
        70: 1,   # OPOST
        72: 1,   # ONLCR
        91: 1,   # CS8
        92: 0,   # PARENB off
    }

    async def start(self, cols: int = 120, rows: int = 30) -> bool:
        """建立 SSH 连接并创建 PTY shell。成功返回 True，失败返回 False。

        连接结果通过 status/error 事件推送；失败时事件流以 None 哨兵结束。
        """
        self.emit({"type": "status", "state": "connecting"})
        conn = None
        try:
            conn = await self._connector.connect(self.server, self._secrets, self._settings)
            self._conn = conn
            bridge = _SessionBridge(self)
            channel, _session_obj = await conn.create_session(
                lambda: _TerminalClientSession(bridge),
                # xterm-256color：更通用的终端标识，改善远端 256 色工具（vim/ls 等）
                # 的颜色显示。
                term_type="xterm-256color",
                term_size=(int(cols), int(rows)),
                # 显式发送标准终端模式（与 OpenSSH 客户端一致），
                # 避免 Windows 远端因空 term_modes 导致终端模式未初始化
                # （PSReadLine 方向键历史异常即源于此）。
                term_modes=self._DEFAULT_TERM_MODES,
                encoding="utf-8",
            )
            self._channel = channel
            # 建立 channel 后补发会话建立前暂存的 resize（前端 onopen 早于 connected）
            if self._pending_resize is not None:
                cols_p, rows_p = self._pending_resize
                self._pending_resize = None
                try:
                    channel.change_terminal_size(int(cols_p), int(rows_p))
                except Exception as exc:
                    logger.warning("session %s pending resize failed: %s", self.id, exc)
            logger.info("SSH session created id=%s server=%s", self.id, self.server.get("name"))
            self.emit({"type": "status", "state": "connected"})
            return True
        except asyncio.CancelledError:
            # 客户端在连接建立期间断开：释放已建立的连接后重新抛出
            if conn is not None:
                try:
                    conn.close()
                except Exception:
                    pass
            self._closed = True
            raise
        except Exception as exc:
            self._closed = True
            logger.warning("SSH connect failed id=%s server=%s: %s",
                           self.id, self.server.get("name"), exc)
            self.emit({"type": "error", "message": friendly_connect_error(exc, self.server)})
            self.emit({"type": "status", "state": "disconnected"})
            await self._release_connection()
            self._finish()
            return False

    def write_input(self, data: str) -> None:
        if self._closed or self._channel is None:
            return
        try:
            self._channel.write(data)
        except Exception as exc:
            logger.warning("session %s input write failed: %s", self.id, exc)

    def resize(self, cols: int, rows: int) -> None:
        # 会话/通道未就绪时暂存，start() 建立 channel 后补发（避免初始 resize 丢失）
        if self._channel is None:
            self._pending_resize = (int(cols), int(rows))
            return
        self._pending_resize = None
        if self._closed:
            return
        try:
            self._channel.change_terminal_size(int(cols), int(rows))
        except Exception as exc:
            logger.warning("session %s resize failed: %s", self.id, exc)

    async def close(self) -> None:
        """关闭会话并释放资源（幂等）。"""
        if self._closed:
            if self._cleanup_task is not None:
                await self._cleanup_task
            return
        self._closed = True
        self.emit({"type": "status", "state": "disconnected"})
        await self._release_connection()
        self._finish()
        logger.info("SSH session closed id=%s server=%s", self.id, self.server.get("name"))

    # ------------------------------------------------------------- 回调

    def _on_data(self, data) -> None:
        if self._closed:
            return
        self.emit({"type": "output", "data": data})

    def _on_connection_lost(self, exc) -> None:
        """asyncssh 通道关闭 / 连接丢失回调（运行在事件循环内）。"""
        if self._closed:
            return
        self._closed = True
        if exc is None:
            # 远程 shell 正常退出（如输入 exit）
            logger.info("SSH session ended id=%s server=%s", self.id, self.server.get("name"))
            self.emit({"type": "status", "state": "disconnected"})
        else:
            logger.warning("SSH session lost id=%s server=%s: %s",
                           self.id, self.server.get("name"), exc)
            self.emit({"type": "error", "message": f"Connection lost: {exc}"})
            self.emit({"type": "status", "state": "disconnected"})
        self._schedule_cleanup()
        self._finish()

    # ------------------------------------------------------------- 内部

    def _finish(self) -> None:
        self.emit(None)  # 事件流结束哨兵

    def _schedule_cleanup(self) -> None:
        if self._cleanup_task is None:
            try:
                loop = asyncio.get_running_loop()
            except RuntimeError:
                loop = asyncio.get_event_loop()
            self._cleanup_task = loop.create_task(self._release_connection())

    async def _release_connection(self) -> None:
        conn, self._conn = self._conn, None
        self._channel = None
        if conn is not None:
            try:
                conn.close()
                await conn.wait_closed()
            except Exception as exc:
                logger.debug("session %s connection close: %s", self.id, exc)
