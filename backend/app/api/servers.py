"""服务器管理 REST API（CONTRACT.md §3）。"""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Request

from ..models.server import FavoriteUpdate, ServerCreate, ServerOut, ServerUpdate

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/servers", tags=["servers"])


def _storage(request: Request):
    return request.app.state.storage


@router.get("", response_model=list[ServerOut])
def list_servers(request: Request):
    storage = _storage(request)
    records = storage.servers.all()
    records.sort(key=lambda r: (not bool(r.get("favorite", False)), r.get("created_at", 0)))
    return [ServerOut.from_record(r) for r in records]


@router.post("", response_model=ServerOut, status_code=201)
def create_server(payload: ServerCreate, request: Request):
    storage = _storage(request)
    record = storage.servers.create(payload.model_dump())
    logger.info("Server created: %s", record["name"])
    return ServerOut.from_record(record)


@router.put("/{server_id}", response_model=ServerOut)
def update_server(server_id: str, payload: ServerUpdate, request: Request):
    storage = _storage(request)
    record = storage.servers.update(server_id, payload.model_dump(exclude_unset=True))
    if record is None:
        raise HTTPException(status_code=404, detail="Server not found")
    logger.info("Server updated: %s", record["name"])
    return ServerOut.from_record(record)


@router.patch("/{server_id}/favorite", response_model=ServerOut)
def set_favorite(server_id: str, payload: FavoriteUpdate, request: Request):
    storage = _storage(request)
    record = storage.servers.set_favorite(server_id, payload.favorite)
    if record is None:
        raise HTTPException(status_code=404, detail="Server not found")
    return ServerOut.from_record(record)


@router.delete("/{server_id}", status_code=204)
async def delete_server(server_id: str, request: Request):
    storage = _storage(request)
    if not storage.servers.delete(server_id):
        raise HTTPException(status_code=404, detail="Server not found")
    # 关闭该服务器上的活动 SSH 会话
    await request.app.state.manager.close_by_server(server_id)
    logger.info("Server deleted: %s", server_id)


@router.post("/import-ssh-config")
def import_ssh_config(request: Request):
    storage = _storage(request)
    path = request.app.state.settings.ssh_config_path
    added, skipped = storage.servers.import_from_ssh_config(path)
    logger.info("SSH config import: added=%d skipped=%d", added, skipped)
    return {"added": added, "skipped": skipped}
