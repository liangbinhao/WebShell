"""常用命令 REST API（CONTRACT.md §3）。"""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Query, Request

from ..models.command import CommandCreate, CommandOut, CommandUpdate
from ..models.server import FavoriteUpdate

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/commands", tags=["commands"])


def _storage(request: Request):
    return request.app.state.storage


@router.get("", response_model=list[CommandOut])
def list_commands(request: Request, category: str | None = Query(default=None)):
    storage = _storage(request)
    records = storage.commands.list(category=category)
    records.sort(key=lambda r: (not bool(r.get("favorite", False)), r.get("created_at", 0)))
    return [CommandOut.from_record(r) for r in records]


@router.get("/categories", response_model=list[str])
def list_categories(request: Request):
    return _storage(request).commands.categories()


@router.post("", response_model=CommandOut, status_code=201)
def create_command(payload: CommandCreate, request: Request):
    storage = _storage(request)
    record = storage.commands.create(payload.model_dump())
    logger.info("Command created: %s", record["name"])
    return CommandOut.from_record(record)


@router.put("/{command_id}", response_model=CommandOut)
def update_command(command_id: str, payload: CommandUpdate, request: Request):
    storage = _storage(request)
    record = storage.commands.update(command_id, payload.model_dump(exclude_unset=True))
    if record is None:
        raise HTTPException(status_code=404, detail="Command not found")
    return CommandOut.from_record(record)


@router.patch("/{command_id}/favorite", response_model=CommandOut)
def set_favorite(command_id: str, payload: FavoriteUpdate, request: Request):
    storage = _storage(request)
    record = storage.commands.set_favorite(command_id, payload.favorite)
    if record is None:
        raise HTTPException(status_code=404, detail="Command not found")
    return CommandOut.from_record(record)


@router.delete("/{command_id}", status_code=204)
def delete_command(command_id: str, request: Request):
    storage = _storage(request)
    if not storage.commands.delete(command_id):
        raise HTTPException(status_code=404, detail="Command not found")
