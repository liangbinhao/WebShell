"""命令历史 REST API（CONTRACT.md §3）。"""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Query, Request

from ..models.history import HistoryCreate, HistoryOut

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/history", tags=["history"])


def _storage(request: Request):
    return request.app.state.storage


@router.get("", response_model=list[HistoryOut])
def list_history(request: Request,
                 q: str | None = Query(default=None),
                 server_id: str | None = Query(default=None),
                 limit: int | None = Query(default=None)):
    storage = _storage(request)
    records = storage.history.list(q=q, server_id=server_id, limit=limit)
    return [HistoryOut.from_record(r) for r in records]


@router.post("", response_model=HistoryOut, status_code=201)
def add_history(payload: HistoryCreate, request: Request):
    storage = _storage(request)
    record = storage.history.add(payload.server_id, payload.server_name,
                                 payload.username, payload.command)
    return HistoryOut.from_record(record)


@router.delete("/{history_id}", status_code=204)
def delete_history(history_id: str, request: Request):
    storage = _storage(request)
    if not storage.history.delete(history_id):
        raise HTTPException(status_code=404, detail="History not found")
