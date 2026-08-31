"""单元测试：~/.ssh/config 解析与导入。"""

from __future__ import annotations

from app.config.settings import Settings
from app.config.storage import Storage
from app.utils.ssh_config import (
    entry_to_candidate,
    parse_ssh_config_text,
    _proxy_jump_aliases,
)


def test_parse_basic():
    entries = parse_ssh_config_text(
        """
# comment
Host dev1
    HostName 10.0.0.1
    Port 2222
    User developer

Host dev2
    HostName 10.0.0.2
"""
    )
    assert len(entries) == 2
    assert entries[0]["patterns"] == ["dev1"]
    assert entries[0]["options"]["hostname"] == ["10.0.0.1"]
    assert entries[0]["options"]["port"] == ["2222"]
    assert entries[0]["options"]["user"] == ["developer"]


def test_parse_ignores_wildcard():
    entries = parse_ssh_config_text(
        """
Host *
    User root

Host dev
    HostName h
"""
    )
    cand = [entry_to_candidate(e) for e in entries]
    assert cand[0] is None  # Host * 跳过
    assert cand[1] is not None


def test_entry_to_candidate():
    entries = parse_ssh_config_text(
        """
Host dev1
    HostName 10.0.0.1
    User developer
    IdentityFile ~/.ssh/id_rsa

Host dev2
    User u
"""
    )
    c1 = entry_to_candidate(entries[0])
    assert c1["name"] == "dev1"
    assert c1["host"] == "10.0.0.1"
    assert c1["auth_type"] == "key"
    assert c1["key_path"].endswith(".ssh/id_rsa")
    c2 = entry_to_candidate(entries[1])
    assert c2["host"] == "dev2"  # 无 HostName 时用 Host 别名
    assert c2["auth_type"] == "password"


def test_proxy_jump_aliases():
    assert _proxy_jump_aliases("jump1,jump2") == ["jump1", "jump2"]
    assert _proxy_jump_aliases("ops@jump1:22") == ["jump1"]
    assert _proxy_jump_aliases("a b") == ["a", "b"]
    assert _proxy_jump_aliases("") == []


def test_import_resolves_proxy_jump(tmp_path):
    settings = Settings(data_dir=tmp_path / "d", known_hosts=tmp_path / "k",
                        ssh_config_path=tmp_path / "c")
    storage = Storage.init(settings)
    config_path = tmp_path / "c"
    config_path.write_text(
        """
Host bastion
    HostName 10.0.0.100
    User ops
    IdentityFile ~/.ssh/bastion_key

Host app1
    HostName 10.0.0.1
    User dev
    ProxyJump bastion
""",
        encoding="utf-8",
    )
    added, skipped = storage.servers.import_from_ssh_config(config_path)
    assert (added, skipped) == (2, 0)
    by_name = {s["name"]: s for s in storage.servers.all()}
    assert by_name["bastion"]["auth_type"] == "key"
    assert by_name["app1"]["proxy_jump"] == [by_name["bastion"]["id"]]


def test_import_duplicates_skipped(tmp_path):
    settings = Settings(data_dir=tmp_path / "d", known_hosts=tmp_path / "k",
                        ssh_config_path=tmp_path / "c")
    storage = Storage.init(settings)
    config_path = tmp_path / "c"
    config_path.write_text("Host dup\n    HostName h\n    User u\n", encoding="utf-8")
    assert storage.servers.import_from_ssh_config(config_path) == (1, 0)
    # 再次导入 → 全部跳过
    assert storage.servers.import_from_ssh_config(config_path) == (0, 1)
