"""服务器数据模型（CONTRACT.md §2）。"""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator


class ServerBase(BaseModel):
    name: str
    host: str
    port: int = 22
    username: str = ""
    auth_type: Literal["password", "key"] = "password"
    password: Optional[str] = None
    key_path: Optional[str] = None
    passphrase: Optional[str] = None
    proxy_jump: list[str] = Field(default_factory=list)
    favorite: bool = False

    @field_validator("port")
    @classmethod
    def _check_port(cls, v: int) -> int:
        if not (1 <= v <= 65535):
            raise ValueError("port must be between 1 and 65535")
        return v

    @field_validator("name", "host")
    @classmethod
    def _not_blank(cls, v: str) -> str:
        if v is None or not v.strip():
            raise ValueError("must not be empty")
        return v


class ServerCreate(ServerBase):
    pass


class ServerUpdate(BaseModel):
    """更新模型：password / passphrase 缺省（或 null）表示不修改。"""

    name: Optional[str] = None
    host: Optional[str] = None
    port: Optional[int] = None
    username: Optional[str] = None
    auth_type: Optional[Literal["password", "key"]] = None
    password: Optional[str] = None
    key_path: Optional[str] = None
    passphrase: Optional[str] = None
    proxy_jump: Optional[list[str]] = None
    favorite: Optional[bool] = None

    @field_validator("port")
    @classmethod
    def _check_port(cls, v: Optional[int]) -> Optional[int]:
        if v is not None and not (1 <= v <= 65535):
            raise ValueError("port must be between 1 and 65535")
        return v

    @field_validator("name", "host")
    @classmethod
    def _not_blank(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and not v.strip():
            raise ValueError("must not be empty")
        return v


class ServerOut(BaseModel):
    """响应模型：绝不包含 password / passphrase / key_path（CONTRACT.md §5）。"""

    id: str
    name: str
    host: str
    port: int
    username: str
    auth_type: str
    proxy_jump: list[str]
    favorite: bool
    created_at: int
    updated_at: int

    @classmethod
    def from_record(cls, record: dict) -> "ServerOut":
        return cls(
            id=record["id"],
            name=record["name"],
            host=record["host"],
            port=record.get("port", 22),
            username=record.get("username", ""),
            auth_type=record.get("auth_type", "password"),
            proxy_jump=list(record.get("proxy_jump") or []),
            favorite=bool(record.get("favorite", False)),
            created_at=record.get("created_at", 0),
            updated_at=record.get("updated_at", 0),
        )


class FavoriteUpdate(BaseModel):
    favorite: bool
