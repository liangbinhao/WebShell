"""REST API 测试：命令历史（CONTRACT.md §3）。"""

from __future__ import annotations


def add_history(client, **overrides):
    payload = {
        "server_id": "srv-1",
        "server_name": "DEV-01",
        "username": "developer",
        "command": "docker ps",
        **overrides,
    }
    resp = client.post("/api/history", json=payload)
    assert resp.status_code == 201, resp.text
    return resp.json()


def test_add_history(client):
    data = add_history(client)
    assert data["server_id"] == "srv-1"
    assert data["server_name"] == "DEV-01"
    assert data["command"] == "docker ps"
    assert "id" in data
    assert isinstance(data["executed_at"], int)


def test_add_history_validation(client):
    assert client.post("/api/history", json={"server_id": "", "command": "x"}).status_code == 422
    assert client.post("/api/history", json={"server_id": "s", "command": ""}).status_code == 422


def test_list_history_newest_first(client):
    add_history(client, command="first")
    add_history(client, command="second")
    items = client.get("/api/history").json()
    assert [x["command"] for x in items] == ["second", "first"]


def test_search_history(client):
    add_history(client, command="docker ps")
    add_history(client, command="docker logs -f app")
    add_history(client, command="ls -la")
    assert [x["command"] for x in client.get("/api/history", params={"q": "docker"}).json()] == [
        "docker logs -f app", "docker ps",
    ]


def test_filter_by_server(client):
    add_history(client, command="a", server_id="s1")
    add_history(client, command="b", server_id="s2")
    items = client.get("/api/history", params={"server_id": "s1"}).json()
    assert [x["command"] for x in items] == ["a"]


def test_delete_history(client):
    data = add_history(client)
    assert client.delete(f"/api/history/{data['id']}").status_code == 204
    assert client.get("/api/history").json() == []
    assert client.delete(f"/api/history/{data['id']}").status_code == 404
