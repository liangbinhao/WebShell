"""REST API 测试：常用命令（CONTRACT.md §3）。"""

from __future__ import annotations


def create_command(client, **overrides):
    payload = {
        "name": "查看磁盘",
        "content": "df -h",
        "category": "Linux",
        "description": "查看磁盘使用情况",
        **overrides,
    }
    resp = client.post("/api/commands", json=payload)
    assert resp.status_code == 201, resp.text
    return resp.json()


def test_create_command(client):
    data = create_command(client)
    assert data["name"] == "查看磁盘"
    assert data["content"] == "df -h"
    assert data["category"] == "Linux"
    assert data["favorite"] is False
    assert "id" in data
    assert isinstance(data["created_at"], int)


def test_list_commands_and_category_filter(client):
    create_command(client)
    create_command(client, name="查看内存", content="free -h")
    create_command(client, name="查看容器", content="docker ps", category="Docker")
    all_cmds = client.get("/api/commands").json()
    assert len(all_cmds) == 3
    linux = client.get("/api/commands", params={"category": "Linux"}).json()
    assert {c["name"] for c in linux} == {"查看磁盘", "查看内存"}
    assert client.get("/api/commands", params={"category": "Nope"}).json() == []


def test_categories(client):
    create_command(client)
    create_command(client, name="x", content="y", category="Docker")
    create_command(client, name="z", content="w", category="linux")
    categories = client.get("/api/commands/categories").json()
    # 大小写不敏感排序，同名字母序稳定
    assert categories == ["Docker", "Linux", "linux"]


def test_update_command(client):
    data = create_command(client)
    resp = client.put(f"/api/commands/{data['id']}", json={"content": "df -hT"})
    assert resp.status_code == 200
    assert resp.json()["content"] == "df -hT"
    assert resp.json()["name"] == "查看磁盘"  # 未提供的字段保持不变


def test_update_command_not_found(client):
    assert client.put("/api/commands/nope", json={"name": "x"}).status_code == 404


def test_favorite_toggle(client):
    data = create_command(client)
    resp = client.patch(f"/api/commands/{data['id']}/favorite", json={"favorite": True})
    assert resp.status_code == 200
    assert resp.json()["favorite"] is True


def test_favorite_toggle_not_found(client):
    assert client.patch("/api/commands/nope/favorite", json={"favorite": True}).status_code == 404


def test_delete_command(client):
    data = create_command(client)
    assert client.delete(f"/api/commands/{data['id']}").status_code == 204
    assert client.delete(f"/api/commands/{data['id']}").status_code == 404
    assert client.get("/api/commands").json() == []


def test_command_template_content(client):
    data = create_command(client, content="docker logs --tail {lines} -f {container}")
    assert data["content"] == "docker logs --tail {lines} -f {container}"
