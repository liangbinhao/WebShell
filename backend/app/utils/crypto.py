"""密码 / 私钥口令加密存储（Fernet）。

密码等敏感认证信息以 Fernet 密文落盘，明文只存在于后端进程内存中。
密钥文件存放在数据目录下（默认 backend/data/secret.key），权限 0600。
"""

from __future__ import annotations

import base64
import logging
import os
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken

logger = logging.getLogger(__name__)

KEY_FILENAME = "secret.key"


class PasswordCipher:
    """基于 Fernet 的对称加密器，用于加密 SSH 密码与私钥口令。"""

    def __init__(self, key: bytes):
        self._fernet = Fernet(key)

    @classmethod
    def generate_key(cls) -> bytes:
        return Fernet.generate_key()

    @classmethod
    def load_or_create(cls, key_path: Path) -> "PasswordCipher":
        key_path = Path(key_path)
        if key_path.exists():
            key = key_path.read_bytes().strip()
            try:
                decoded = base64.urlsafe_b64decode(key + b"=" * (-len(key) % 4))
            except Exception:
                decoded = b""
            if len(decoded) != 32:
                raise ValueError(f"Invalid Fernet key file: {key_path}")
        else:
            key = cls.generate_key()
            key_path.parent.mkdir(parents=True, exist_ok=True)
            fd = os.open(str(key_path), os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
            with os.fdopen(fd, "wb") as f:
                f.write(key)
            logger.info("Generated new encryption key at %s", key_path)
        return cls(key)

    def encrypt(self, plaintext: str) -> str:
        """加密明文，返回 urlsafe base64 密文（字符串）。"""
        if plaintext is None:
            return ""
        token = self._fernet.encrypt(plaintext.encode("utf-8"))
        return token.decode("ascii")

    def decrypt(self, token: str) -> str:
        """解密密文；token 为空返回空串。"""
        if not token:
            return ""
        try:
            return self._fernet.decrypt(token.encode("ascii")).decode("utf-8")
        except InvalidToken:
            logger.error("Failed to decrypt secret: invalid token")
            raise ValueError("Failed to decrypt secret: invalid token (key mismatch?)")
