"""命令历史数据模型（CONTRACT.md §2）。"""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, field_validator


class HistoryCreate(BaseModel):
    server_id: str
    server_name: str = ""
    username: str = ""
    command: str

    @field_validator("server_id", "command")
    @classmethod
    def _not_blank(cls, v: str) -> str:
        if v is None or not v.strip():
            raise ValueError("must not be empty")
        return v


class HistoryOut(HistoryCreate):
    id: str
    executed_at: int

    @classmethod
    def from_record(cls, record: dict) -> "HistoryOut":
        return cls(
            id=record["id"],
            server_id=record["server_id"],
            server_name=record.get("server_name", ""),
            username=record.get("username", ""),
            command=record["command"],
            executed_at=record.get("executed_at", 0),
        )
