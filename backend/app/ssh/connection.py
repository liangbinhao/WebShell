"""SSH 连接建立（含跳板机 ProxyJump 链）。

- 认证：密码（Fernet 解密后仅内存使用）或私钥（key_path + passphrase）；
- Host key：强制使用 known_hosts 校验（绝不默认关闭），文件缺失时自动创建空文件；
- 跳板机：按 proxy_jump 顺序逐个连接跳板服务器，通过 asyncssh 的 tunnel
  参数串联（多跳支持），目标连接关闭时 asyncssh 会自动级联关闭跳板连接。
"""

from __future__ import annotations

import asyncio
import logging
import os
from pathlib import Path
from typing import Awaitable, Callable, Optional

import asyncssh

from ..config.settings import Settings

logger = logging.getLogger(__name__)

# id -> (record, secrets)；返回 None 表示不存在
ServerLoader = Callable[[str], Optional[tuple[dict, dict]]]


class ServerConfigError(ValueError):
    """服务器配置错误（缺用户名 / 密码 / 跳板不存在等）。"""


def ensure_known_hosts_file(path) -> Path:
    """确保 known_hosts 文件存在（不存在则创建空文件，权限 0600）。"""
    p = Path(path).expanduser()
    if not p.exists():
        p.parent.mkdir(parents=True, exist_ok=True)
        fd = os.open(str(p), os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        os.close(fd)
    return p


def build_connect_options(server: dict, secrets: dict, settings: Settings,
                          tunnel: Optional[object] = None) -> dict:
    """构造 asyncssh.connect 的连接选项（不含 host/port）。"""
    username = (server.get("username") or "").strip()
    if not username:
        raise ServerConfigError("服务器未配置用户名（username）")
    opts: dict = {
        "username": username,
        "known_hosts": str(ensure_known_hosts_file(settings.known_hosts)),
        "connect_timeout": settings.ssh_connect_timeout,
        "keepalive_interval": settings.ssh_keepalive,
        "keepalive_count_max": settings.ssh_keepalive_count_max,
    }
    auth_type = server.get("auth_type", "password")
    if auth_type == "key":
        key_path = server.get("key_path")
        if not key_path:
            raise ServerConfigError("认证方式为私钥，但未配置 key_path")
        opts["client_keys"] = [key_path]
        passphrase = secrets.get("passphrase") or ""
        if passphrase:
            opts["passphrase"] = passphrase
    else:
        password = secrets.get("password") or ""
        if not password:
            raise ServerConfigError("服务器未配置密码（请在服务器设置中补充）")
        opts["password"] = password
    if tunnel is not None:
        opts["tunnel"] = tunnel
    return opts


def friendly_connect_error(exc: Exception, server: dict) -> str:
    """把连接异常转换为面向用户的错误消息（不包含任何机密信息）。"""
    name = server.get("name") or server.get("host") or "?"
    if isinstance(exc, ServerConfigError):
        return f"Failed to connect to {name}: {exc}"
    if isinstance(exc, asyncssh.HostKeyNotVerifiable):
        host = server.get("host", "?")
        port = server.get("port", 22)
        return (
            f"Failed to connect to {name}: 主机密钥未通过验证（{host}）。"
            f"请先在服务器上执行: ssh-keyscan -p {port} {host} >> ~/.ssh/known_hosts"
        )
    if isinstance(exc, asyncssh.PermissionDenied):
        return f"Failed to connect to {name}: 认证失败（用户名 / 密码 / 私钥不正确）"
    if isinstance(exc, (asyncssh.KeyImportError, asyncssh.KeyEncryptionError)):
        return f"Failed to connect to {name}: 私钥加载失败: {exc}"
    if isinstance(exc, (asyncio.TimeoutError, asyncssh.TimeoutError)):
        return f"Failed to connect to {name}: 连接超时"
    if isinstance(exc, OSError):
        return f"Failed to connect to {name}: 网络错误: {exc}"
    return f"Failed to connect to {name}: {exc}"


class SSHConnector:
    """负责建立 SSH 连接，含跳板机链（连接对测试可注入 mock）。"""

    def __init__(self, server_loader: ServerLoader):
        self._server_loader = server_loader

    async def connect(self, server: dict, secrets: dict,
                      settings: Settings) -> asyncssh.SSHClientConnection:
        """按 server.proxy_jump 顺序连接跳板，最终连接目标服务器。"""
        tunnel: Optional[asyncssh.SSHClientConnection] = None
        try:
            for jump_id in server.get("proxy_jump") or []:
                loaded = self._server_loader(jump_id)
                if loaded is None:
                    raise ServerConfigError(f"跳板服务器不存在: {jump_id}")
                jump_server, jump_secrets = loaded
                tunnel = await self._connect_one(jump_server, jump_secrets, settings, tunnel)
            return await self._connect_one(server, secrets, settings, tunnel)
        except Exception:
            # 失败时关闭已建立的跳板链（关闭最外层会级联关闭整条链）
            if tunnel is not None:
                try:
                    tunnel.close()
                except Exception:
                    pass
            raise

    async def _connect_one(self, server: dict, secrets: dict, settings: Settings,
                           tunnel: Optional[object] = None) -> asyncssh.SSHClientConnection:
        host = (server.get("host") or "").strip()
        if not host:
            raise ServerConfigError("服务器未配置 host")
        port = int(server.get("port") or 22)
        opts = build_connect_options(server, secrets, settings, tunnel)
        logger.info("Connecting SSH %s@%s:%s (via tunnel=%s)", opts.get("username"), host, port, tunnel is not None)
        return await asyncssh.connect(host, port, **opts)
