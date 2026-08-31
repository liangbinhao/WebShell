"""共享 fixtures：隔离的数据目录 + 测试应用 + TestClient。"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.config.settings import Settings
from app.main import create_app


@pytest.fixture()
def settings(tmp_path):
    return Settings(
        data_dir=tmp_path / "data",
        known_hosts=tmp_path / "known_hosts",
        ssh_config_path=tmp_path / "ssh_config",
    )


@pytest.fixture()
def app(settings):
    return create_app(settings=settings)


@pytest.fixture()
def client(app):
    with TestClient(app) as c:
        yield c
