"""单元测试：JSON 存储层与各仓库（服务器/命令/历史）。"""

from __future__ import annotations

import json

import pytest

from app.config.settings import Settings
from app.config.storage import JsonStore, HistoryRepo, Storage


def make_storage(tmp_path):
    settings = Settings(
        data_dir=tmp_path / "data",
        known_hosts=tmp_path / "known_hosts",
        ssh_config_path=tmp_path / "ssh_config",
    )
    return Storage.init(settings)


# ---------------------------------------------------------------- JsonStore


def test_jsonsotre_roundtrip(tmp_path):
    store = JsonStore(tmp_path / "items.json", [])
    store.save([{"id": "1", "value": "中文内容"}])
    assert store.load() == [{"id": "1", "value": "中文内容"}]
    assert (tmp_path / "items.json").exists()


def test_jsonsotre_corrupt_file_recovers(tmp_path):
    path = tmp_path / "items.json"
    path.write_text("{ not valid json !!!")
    store = JsonStore(path, [])
    assert store.load() == []
    # 损坏文件被备份
    assert (tmp_path / "items.json.corrupt").exists()


def test_jsonsotre_missing_file_returns_default(tmp_path):
    store = JsonStore(tmp_path / "nope.json", {"a": 1})
    assert store.load() == {"a": 1}


# ---------------------------------------------------------------- 服务器


def test_server_create_encrypts_password(tmp_path):
    storage = make_storage(tmp_path)
    record = storage.servers.create({
        "name": "DEV-01", "host": "10.0.0.1", "port": 22,
        "username": "dev", "auth_type": "password", "password": "s3cret!",
    })
    assert record["password_enc"] != "s3cret!"
    assert "s3cret!" not in record["password_enc"]
    # 落盘文件不包含明文密码
    raw = (tmp_path / "data" / "servers.json").read_text(encoding="utf-8")
    assert "s3cret!" not in raw
    # 解密还原
    assert storage.servers.secrets(record)["password"] == "s3cret!"


def test_server_create_key_auth(tmp_path):
    storage = make_storage(tmp_path)
    record = storage.servers.create({
        "name": "KEY-01", "host": "h", "username": "u",
        "auth_type": "key", "key_path": "/home/u/.ssh/id_rsa",
        "passphrase": "pp",
    })
    assert record["key_path"] == "/home/u/.ssh/id_rsa"
    assert storage.servers.secrets(record)["passphrase"] == "pp"


def test_server_update_password_semantics(tmp_path):
    storage = make_storage(tmp_path)
    record = storage.servers.create({
        "name": "S", "host": "h", "username": "u",
        "auth_type": "password", "password": "old-pass",
    })
    sid = record["id"]
    # 缺省 password → 不修改
    storage.servers.update(sid, {"name": "S2"})
    assert storage.servers.secrets(storage.servers.get(sid))["password"] == "old-pass"
    # 显式 null → 不修改
    storage.servers.update(sid, {"password": None})
    assert storage.servers.secrets(storage.servers.get(sid))["password"] == "old-pass"
    # 新密码 → 更新
    storage.servers.update(sid, {"password": "new-pass"})
    assert storage.servers.secrets(storage.servers.get(sid))["password"] == "new-pass"
    # 空串 → 清空
    storage.servers.update(sid, {"password": ""})
    assert storage.servers.secrets(storage.servers.get(sid))["password"] == ""


def test_server_favorite_and_delete(tmp_path):
    storage = make_storage(tmp_path)
    record = storage.servers.create({"name": "S", "host": "h", "username": "u"})
    sid = record["id"]
    updated = storage.servers.set_favorite(sid, True)
    assert updated["favorite"] is True
    assert storage.servers.delete(sid) is True
    assert storage.servers.get(sid) is None
    assert storage.servers.delete(sid) is False


def test_server_update_missing_returns_none(tmp_path):
    storage = make_storage(tmp_path)
    assert storage.servers.update("nope", {"name": "x"}) is None


# ---------------------------------------------------------------- 命令


def test_command_crud_and_categories(tmp_path):
    storage = make_storage(tmp_path)
    c1 = storage.commands.create({"name": "df", "content": "df -h", "category": "Linux", "description": "磁盘"})
    storage.commands.create({"name": "mem", "content": "free -h", "category": "Linux"})
    storage.commands.create({"name": "ps", "content": "docker ps", "category": "Docker"})
    assert storage.commands.categories() == ["Docker", "Linux"]
    assert {c["name"] for c in storage.commands.list(category="Linux")} == {"df", "mem"}
    updated = storage.commands.update(c1["id"], {"content": "df -hT"})
    assert updated["content"] == "df -hT"
    storage.commands.set_favorite(c1["id"], True)
    assert storage.commands.get(c1["id"])["favorite"] is True
    assert storage.commands.delete(c1["id"]) is True


# ---------------------------------------------------------------- 历史


def test_history_add_and_list(tmp_path):
    storage = make_storage(tmp_path)
    storage.history.add("s1", "DEV-01", "dev", "docker ps")
    storage.history.add("s1", "DEV-01", "dev", "ls -la")
    storage.history.add("s2", "DEV-02", "dev", "docker ps")
    items = storage.history.list()
    assert len(items) == 3
    # 倒序：最新在前
    assert items[0]["command"] == "docker ps"
    # 搜索
    assert [x["command"] for x in storage.history.list(q="docker")] == ["docker ps", "docker ps"]
    # 服务器过滤
    assert [x["server_id"] for x in storage.history.list(server_id="s2")] == ["s2"]
    # 组合过滤
    assert storage.history.list(q="ls", server_id="s1")[0]["command"] == "ls -la"


def test_history_trim(tmp_path):
    settings = Settings(data_dir=tmp_path / "d", known_hosts=tmp_path / "k",
                        ssh_config_path=tmp_path / "c")
    settings.history_max = 3
    store = JsonStore(tmp_path / "d" / "history.json", [])
    repo = HistoryRepo(store, max_entries=settings.history_max)
    for i in range(5):
        repo.add("s1", "S", "u", f"cmd-{i}")
    items = repo.list()
    assert len(items) == 3
    assert items[0]["command"] == "cmd-4"  # 保留最近 3 条
    assert items[-1]["command"] == "cmd-2"


def test_history_delete(tmp_path):
    storage = make_storage(tmp_path)
    rec = storage.history.add("s1", "S", "u", "pwd")
    assert storage.history.delete(rec["id"]) is True
    assert storage.history.delete(rec["id"]) is False
