"""单元测试：加密解密（Fernet）与密钥文件管理。"""

from __future__ import annotations

import pytest

from app.utils.crypto import PasswordCipher


def test_roundtrip(tmp_path):
    cipher = PasswordCipher.load_or_create(tmp_path / "secret.key")
    token = cipher.encrypt("my-password")
    assert token != "my-password"
    assert "my-password" not in token
    assert cipher.decrypt(token) == "my-password"


def test_empty_token_decrypts_to_empty(tmp_path):
    cipher = PasswordCipher.load_or_create(tmp_path / "secret.key")
    assert cipher.decrypt("") == ""


def test_encrypt_none_returns_empty(tmp_path):
    cipher = PasswordCipher.load_or_create(tmp_path / "secret.key")
    assert cipher.encrypt(None) == ""


def test_key_file_created_with_0600(tmp_path):
    key_path = tmp_path / "secret.key"
    PasswordCipher.load_or_create(key_path)
    assert key_path.exists()
    assert (key_path.stat().st_mode & 0o777) == 0o600


def test_reload_uses_same_key(tmp_path):
    key_path = tmp_path / "secret.key"
    c1 = PasswordCipher.load_or_create(key_path)
    token = c1.encrypt("persistent-secret")
    c2 = PasswordCipher.load_or_create(key_path)
    assert c2.decrypt(token) == "persistent-secret"


def test_different_key_cannot_decrypt(tmp_path):
    k1 = tmp_path / "k1.key"
    k2 = tmp_path / "k2.key"
    c1 = PasswordCipher.load_or_create(k1)
    PasswordCipher.load_or_create(k2)
    token = c1.encrypt("x")
    with pytest.raises(ValueError):
        PasswordCipher.load_or_create(k2).decrypt(token)


def test_invalid_key_file_raises(tmp_path):
    bad = tmp_path / "bad.key"
    bad.write_text("not-a-valid-fernet-key")
    with pytest.raises(ValueError):
        PasswordCipher.load_or_create(bad)
