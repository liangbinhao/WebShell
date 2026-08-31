"""JSON 文件存储层。

- JsonStore：线程安全的 JSON 文件读写（原子写、损坏备份）；
- Collection：通用集合仓库；
- ServerRepo / CommandRepo / HistoryRepo：与接口解耦的数据访问。

数据文件（servers.json / commands.json / history.json）与加密密钥存放在
settings.data_dir（默认 backend/data/）。
"""

from __future__ import annotations

import copy
import json
import logging
import os
import threading
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Optional

from ..utils.crypto import PasswordCipher
from ..utils.timeutil import now_ms

logger = logging.getLogger(__name__)


class JsonStore:
    """线程安全的 JSON 文件存储，提供 load / save。"""

    def __init__(self, path: Path, default: Any):
        self.path = Path(path)
        self.default = default
        self._lock = threading.RLock()

    def load(self) -> Any:
        with self._lock:
            if not self.path.exists():
                return copy.deepcopy(self.default)
            try:
                with open(self.path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except json.JSONDecodeError:
                # 文件损坏：备份后从默认值重新开始，避免服务不可用
                backup = self.path.with_suffix(self.path.suffix + ".corrupt")
                try:
                    os.replace(self.path, backup)
                    logger.warning("Corrupt JSON store %s backed up to %s", self.path, backup)
                except OSError:
                    logger.warning("Corrupt JSON store %s could not be backed up", self.path)
                return copy.deepcopy(self.default)
            except OSError as exc:
                logger.error("Failed to read store %s: %s", self.path, exc)
                return copy.deepcopy(self.default)

    def save(self, data: Any) -> None:
        with self._lock:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            tmp = self.path.with_name(self.path.name + ".tmp")
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            os.replace(tmp, self.path)
            try:
                os.chmod(self.path, 0o600)
            except OSError:
                pass


class Collection:
    """通用集合仓库：元素为 dict，必须有唯一 id 字段。"""

    def __init__(self, store: JsonStore):
        self._store = store

    def all(self) -> list[dict]:
        return self._store.load()

    def get(self, item_id: str) -> Optional[dict]:
        for item in self.all():
            if item.get("id") == item_id:
                return item
        return None

    def insert(self, item: dict) -> dict:
        items = self.all()
        items.append(item)
        self._store.save(items)
        return item

    def update_fields(self, item_id: str, fields: dict) -> Optional[dict]:
        items = self.all()
        for item in items:
            if item.get("id") == item_id:
                item.update(fields)
                self._store.save(items)
                return item
        return None

    def delete(self, item_id: str) -> bool:
        items = self.all()
        remaining = [x for x in items if x.get("id") != item_id]
        if len(remaining) == len(items):
            return False
        self._store.save(remaining)
        return True


# ---------------------------------------------------------------- servers

_SECRET_FIELDS = ("password", "passphrase")


class ServerRepo(Collection):
    """服务器仓库：密码/私钥口令以 Fernet 密文存储（password_enc / passphrase_enc）。

    对外（REST 响应）永不返回 password / passphrase / key_path（CONTRACT.md §5）。
    """

    def __init__(self, store: JsonStore, cipher: PasswordCipher):
        super().__init__(store)
        self._cipher = cipher

    def _encrypt(self, plain: Optional[str]) -> str:
        return self._cipher.encrypt(plain) if plain else ""

    def _decrypt(self, token: str) -> str:
        return self._cipher.decrypt(token) if token else ""

    def create(self, payload: dict) -> dict:
        now = now_ms()
        record = {
            "id": uuid.uuid4().hex,
            "name": payload["name"],
            "host": payload["host"],
            "port": int(payload.get("port", 22)),
            "username": payload.get("username", ""),
            "auth_type": payload.get("auth_type", "password"),
            "password_enc": self._encrypt(payload.get("password")),
            "passphrase_enc": self._encrypt(payload.get("passphrase")),
            "key_path": payload.get("key_path"),
            "proxy_jump": list(payload.get("proxy_jump") or []),
            "favorite": bool(payload.get("favorite", False)),
            "created_at": now,
            "updated_at": now,
        }
        self.insert(record)
        return record

    def update(self, item_id: str, payload: dict) -> Optional[dict]:
        if self.get(item_id) is None:
            return None
        fields: dict = {}
        for name in ("name", "host", "username", "auth_type", "key_path", "proxy_jump", "favorite"):
            if name in payload:
                fields[name] = payload[name]
        if "port" in payload:
            fields["port"] = int(payload["port"])
        # 密码/口令：缺省（或显式 null）表示不修改；非空字符串才更新（空串表示清空）
        if payload.get("password") is not None:
            fields["password_enc"] = self._encrypt(payload["password"])
        if payload.get("passphrase") is not None:
            fields["passphrase_enc"] = self._encrypt(payload["passphrase"])
        fields["updated_at"] = now_ms()
        return self.update_fields(item_id, fields)

    def set_favorite(self, item_id: str, favorite: bool) -> Optional[dict]:
        return self.update_fields(item_id, {"favorite": bool(favorite), "updated_at": now_ms()})

    def secrets(self, record: dict) -> dict:
        """返回解密后的连接机密（仅内存使用，绝不落盘/返回前端）。"""
        return {
            "password": self._decrypt(record.get("password_enc", "")),
            "passphrase": self._decrypt(record.get("passphrase_enc", "")),
        }

    def import_from_ssh_config(self, config_path) -> tuple[int, int]:
        """从 ~/.ssh/config 导入服务器，返回 (added, skipped)。

        - 通配符条目（如 ``Host *``）与无法确定主机名的条目跳过；
        - 与现有服务器同名（不区分大小写）或与本次导入内重名的跳过；
        - ProxyJump 别名解析为本次导入（或已存在）服务器的 id。
        """
        from ..utils import ssh_config as ssh_config_util

        entries = ssh_config_util.load_config_file(config_path)
        candidates = [
            c for c in (ssh_config_util.entry_to_candidate(e) for e in entries) if c
        ]
        existing_names = {s.get("name", "").lower() for s in self.all()}

        created_by_name: dict[str, dict] = {}
        added = 0
        for cand in candidates:
            name_l = cand["name"].lower()
            if name_l in existing_names or name_l in created_by_name:
                continue
            payload = {k: v for k, v in cand.items() if k != "proxy_aliases"}
            record = self.create(payload)
            created_by_name[cand["name"]] = record
            existing_names.add(name_l)
            added += 1

        # 第二遍：把 ProxyJump 别名解析为服务器 id
        for cand in candidates:
            record = created_by_name.get(cand["name"])
            if record is None:
                continue
            jump_ids = []
            for alias in cand["proxy_aliases"]:
                if alias in created_by_name and created_by_name[alias]["id"] != record["id"]:
                    jump_ids.append(created_by_name[alias]["id"])
            self.update_fields(record["id"], {"proxy_jump": jump_ids})

        skipped = len(entries) - added
        return added, skipped


# ---------------------------------------------------------------- commands


class CommandRepo(Collection):
    """常用命令仓库（命令库 + 命令模板，解耦于服务器与历史）。"""

    def create(self, payload: dict) -> dict:
        now = now_ms()
        record = {
            "id": uuid.uuid4().hex,
            "name": payload["name"],
            "content": payload["content"],
            "category": payload.get("category", "default"),
            "description": payload.get("description", ""),
            "favorite": bool(payload.get("favorite", False)),
            "created_at": now,
            "updated_at": now,
        }
        self.insert(record)
        return record

    def update(self, item_id: str, payload: dict) -> Optional[dict]:
        if self.get(item_id) is None:
            return None
        fields: dict = {}
        for name in ("name", "content", "category", "description", "favorite"):
            if name in payload:
                fields[name] = payload[name]
        fields["updated_at"] = now_ms()
        return self.update_fields(item_id, fields)

    def set_favorite(self, item_id: str, favorite: bool) -> Optional[dict]:
        return self.update_fields(item_id, {"favorite": bool(favorite), "updated_at": now_ms()})

    def list(self, category: Optional[str] = None) -> list[dict]:
        items = self.all()
        if category is not None:
            items = [x for x in items if x.get("category") == category]
        return items

    def categories(self) -> list[str]:
        return sorted({x.get("category", "default") for x in self.all()},
                      key=lambda c: (c.lower(), c))


# ---------------------------------------------------------------- history


class HistoryRepo(Collection):
    """命令历史仓库：按 executed_at 倒序，超出上限自动裁剪。"""

    def __init__(self, store: JsonStore, max_entries: int = 2000):
        super().__init__(store)
        self._max_entries = max_entries

    def list(self, q: Optional[str] = None, server_id: Optional[str] = None, limit: Optional[int] = None) -> list[dict]:
        items = self.all()
        if server_id:
            items = [x for x in items if x.get("server_id") == server_id]
        if q:
            needle = q.lower()
            items = [x for x in items if needle in (x.get("command") or "").lower()]
        # 文件按插入顺序（即执行先后）存储，倒序即为最新在前
        items = list(reversed(items))
        if limit is not None:
            items = items[:limit]
        return items

    def add(self, server_id: str, server_name: str, username: str, command: str) -> dict:
        record = {
            "id": uuid.uuid4().hex,
            "server_id": server_id,
            "server_name": server_name,
            "username": username,
            "command": command,
            "executed_at": now_ms(),
        }
        items = self.all()
        items.append(record)
        # 裁剪超出上限的旧记录（保留最近 max_entries 条）
        if len(items) > self._max_entries:
            items = items[-self._max_entries:]
        self._store.save(items)
        return record


# ---------------------------------------------------------------- container


@dataclass
class Storage:
    settings: Any
    cipher: PasswordCipher
    servers: ServerRepo
    commands: CommandRepo
    history: HistoryRepo

    @classmethod
    def init(cls, settings: Any) -> "Storage":
        settings.data_dir.mkdir(parents=True, exist_ok=True)
        cipher = PasswordCipher.load_or_create(settings.data_dir / "secret.key")
        servers = ServerRepo(JsonStore(settings.data_dir / "servers.json", []), cipher)
        commands = CommandRepo(JsonStore(settings.data_dir / "commands.json", []))
        history = HistoryRepo(JsonStore(settings.data_dir / "history.json", []), max_entries=settings.history_max)
        return cls(settings=settings, cipher=cipher, servers=servers, commands=commands, history=history)
