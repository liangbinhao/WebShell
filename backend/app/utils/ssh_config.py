"""~/.ssh/config 解析与服务器导入。

支持解析 Host / HostName / Port / User / IdentityFile / ProxyJump 等常用指令，
将每个具体主机条目转换为服务器候选（通配符条目如 ``Host *`` 跳过）。
ProxyJump 中的跳板别名在导入时解析为本系统中已导入服务器的 id。
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Optional


def _unquote(value: str) -> str:
    v = value.strip()
    if len(v) >= 2 and v[0] == v[-1] and v[0] in "\"'":
        return v[1:-1]
    return v


def parse_ssh_config_text(text: str) -> list[dict]:
    """解析 ssh config 文本，返回 [{"patterns": [...], "options": {key: [values]}}]。"""
    entries: list[dict] = []
    current: Optional[dict] = None
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split(None, 1)
        key = parts[0].lower()
        value = _unquote(parts[1]) if len(parts) > 1 else ""
        if key == "host":
            if current is not None:
                entries.append(current)
            current = {"patterns": value.split(), "options": {}}
        elif current is not None:
            current["options"].setdefault(key, []).append(value)
    if current is not None:
        entries.append(current)
    return entries


def _first_option(options: dict, key: str) -> Optional[str]:
    values = options.get(key) or []
    return values[0] if values else None


def _proxy_jump_aliases(value: str) -> list[str]:
    """ProxyJump 值（逗号分隔的 [user@]host[:port]）→ 别名列表。"""
    aliases: list[str] = []
    for part in re.split(r"[,\s]+", value.strip()):
        if not part:
            continue
        host = part.rsplit("@", 1)[-1]  # 去掉 user@
        if host.startswith("["):  # IPv6 带端口
            host = host.split("]", 1)[0].lstrip("[")
        elif ":" in host:
            host = host.rsplit(":", 1)[0]  # 去掉 :port
        if host:
            aliases.append(host)
    return aliases


def entry_to_candidate(entry: dict) -> Optional[dict]:
    """主机条目 → 导入候选；通配符条目或无主机名条目返回 None。"""
    patterns = entry["patterns"]
    if not patterns or any(("*" in p or "?" in p) for p in patterns):
        return None
    options = entry["options"]
    name = patterns[0]
    host = _first_option(options, "hostname") or name
    if not host:
        return None
    port = 22
    port_str = _first_option(options, "port")
    if port_str:
        try:
            port = int(port_str)
        except ValueError:
            pass
    username = _first_option(options, "user") or ""
    identity = _first_option(options, "identityfile")
    if identity:
        auth_type = "key"
        key_path = str(Path(identity).expanduser())
    else:
        auth_type = "password"
        key_path = None
    proxy_aliases: list[str] = []
    jump = _first_option(options, "proxyjump")
    if jump:
        proxy_aliases = _proxy_jump_aliases(jump)
    return {
        "name": name,
        "host": host,
        "port": port,
        "username": username,
        "auth_type": auth_type,
        "key_path": key_path,
        "proxy_aliases": proxy_aliases,
    }


def load_config_file(path) -> list[dict]:
    """读取并解析 ssh config 文件；文件不存在返回空列表。"""
    p = Path(path)
    if not p.exists():
        return []
    return parse_ssh_config_text(p.read_text(encoding="utf-8"))
