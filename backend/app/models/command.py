"""常用命令数据模型（CONTRACT.md §2）。"""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel


class CommandBase(BaseModel):
    name: str
    content: str
    category: str = "default"
    description: str = ""
    favorite: bool = False


class CommandCreate(CommandBase):
    pass


class CommandUpdate(BaseModel):
    name: Optional[str] = None
    content: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None
    favorite: Optional[bool] = None


class CommandOut(CommandBase):
    id: str
    created_at: int
    updated_at: int

    @classmethod
    def from_record(cls, record: dict) -> "CommandOut":
        return cls(
            id=record["id"],
            name=record["name"],
            content=record["content"],
            category=record.get("category", "default"),
            description=record.get("description", ""),
            favorite=bool(record.get("favorite", False)),
            created_at=record.get("created_at", 0),
            updated_at=record.get("updated_at", 0),
        )
