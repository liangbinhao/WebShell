"""REST API 测试：服务器管理（CONTRACT.md §3）。"""

from __future__ import annotations

import pytest

from app.config.settings import Settings
from app.main import create_app

SECRET_FIELDS = ("password", "passphrase", "key_path")


def create_server(client, **overrides):
    payload = {
        "name": "DEV-01",
        "host": "10.0.0.1",
        "port": 22,
        "username": "developer",
        "auth_type": "password",
        "password": "s3cret",
        **overrides,
    }
    resp = client.post("/api/servers", json=payload)
    assert resp.status_code == 201, resp.text
    return resp.json()


def assert_no_secrets(payload: dict):
    for field in SECRET_FIELDS:
        assert field not in payload, f"response must not contain {field!r}"


def test_create_server(client):
    data = create_server(client)
    assert data["name"] == "DEV-01"
    assert data["host"] == "10.0.0.1"
    assert data["port"] == 22
    assert data["username"] == "developer"
    assert data["auth_type"] == "password"
    assert data["favorite"] is False
    assert "id" in data
    assert isinstance(data["created_at"], int)
    assert_no_secrets(data)


def test_create_server_with_key_auth(client):
    data = create_server(client, auth_type="key", key_path="/home/u/.ssh/id_rsa",
                         passphrase="pp", password=None)
    assert data["auth_type"] == "key"
    assert_no_secrets(data)


def test_list_servers_never_returns_secrets(client):
    create_server(client)
    create_server(client, name="DEV-02", host="10.0.0.2")
    resp = client.get("/api/servers")
    assert resp.status_code == 200
    servers = resp.json()
    assert len(servers) == 2
    for s in servers:
        assert_no_secrets(s)


def test_update_server(client):
    data = create_server(client)
    sid = data["id"]
    resp = client.put(f"/api/servers/{sid}", json={"name": "DEV-01X", "port": 2222})
    assert resp.status_code == 200
    updated = resp.json()
    assert updated["name"] == "DEV-01X"
    assert updated["port"] == 2222
    assert_no_secrets(updated)


def test_update_server_keep_password_when_absent(client, app):
    data = create_server(client)
    sid = data["id"]
    client.put(f"/api/servers/{sid}", json={"name": "RENAMED"})
    record = app.state.storage.servers.get(sid)
    assert app.state.storage.servers.secrets(record)["password"] == "s3cret"


def test_update_server_change_password(client, app):
    data = create_server(client)
    sid = data["id"]
    client.put(f"/api/servers/{sid}", json={"password": "new-secret"})
    record = app.state.storage.servers.get(sid)
    assert app.state.storage.servers.secrets(record)["password"] == "new-secret"


def test_update_server_not_found(client):
    resp = client.put("/api/servers/does-not-exist", json={"name": "X"})
    assert resp.status_code == 404


def test_delete_server(client):
    data = create_server(client)
    resp = client.delete(f"/api/servers/{data['id']}")
    assert resp.status_code == 204
    assert client.get("/api/servers").json() == []


def test_delete_server_not_found(client):
    assert client.delete("/api/servers/does-not-exist").status_code == 404


def test_favorite_toggle(client):
    data = create_server(client)
    sid = data["id"]
    resp = client.patch(f"/api/servers/{sid}/favorite", json={"favorite": True})
    assert resp.status_code == 200
    assert resp.json()["favorite"] is True
    resp = client.patch(f"/api/servers/{sid}/favorite", json={"favorite": False})
    assert resp.json()["favorite"] is False


def test_favorite_toggle_not_found(client):
    resp = client.patch("/api/servers/nope/favorite", json={"favorite": True})
    assert resp.status_code == 404


def test_create_server_validation(client):
    # 空名称 / 非法端口
    assert client.post("/api/servers", json={"name": "", "host": "h"}).status_code == 422
    assert client.post("/api/servers", json={"name": "x", "host": "h", "port": 0}).status_code == 422
    assert client.post("/api/servers", json={"name": "x", "host": "h", "port": 70000}).status_code == 422


def test_import_ssh_config(client, settings):
    config = """# comment
Host jump1
    HostName 10.0.0.100
    User ops
    IdentityFile ~/.ssh/jump_key

Host dev1
    HostName 10.0.0.1
    User developer
    Port 2222
    ProxyJump jump1

Host *
    User root
"""
    settings.ssh_config_path.write_text(config, encoding="utf-8")
    resp = client.post("/api/servers/import-ssh-config")
    assert resp.status_code == 200
    body = resp.json()
    assert body["added"] == 2
    assert body["skipped"] == 1  # Host * 通配符
    servers = {s["name"]: s for s in client.get("/api/servers").json()}
    assert "jump1" in servers and "dev1" in servers
    jump1, dev1 = servers["jump1"], servers["dev1"]
    assert jump1["auth_type"] == "key"
    assert dev1["auth_type"] == "password"
    assert dev1["port"] == 2222
    assert dev1["username"] == "developer"
    # ProxyJump 别名解析为已导入服务器的 id
    assert dev1["proxy_jump"] == [jump1["id"]]
    for s in servers.values():
        assert_no_secrets(s)


def test_import_ssh_config_skips_duplicates(client, settings):
    create_server(client, name="dev1")
    settings.ssh_config_path.write_text(
        "Host dev1\n    HostName 10.0.0.1\n    User u\n", encoding="utf-8"
    )
    resp = client.post("/api/servers/import-ssh-config")
    assert resp.json() == {"added": 0, "skipped": 1}


def test_import_ssh_config_missing_file(client):
    resp = client.post("/api/servers/import-ssh-config")
    assert resp.status_code == 200
    assert resp.json() == {"added": 0, "skipped": 0}
