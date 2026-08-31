"""单元测试：命令模板占位符解析（requirements.md §11）。"""

from __future__ import annotations

from app.utils.template import extract_template_params, has_template_params


def test_extract_params_in_order_dedup():
    params = extract_template_params("docker logs --tail {lines} -f {container} {lines}")
    assert params == ["lines", "container"]


def test_no_params():
    assert extract_template_params("df -h") == []
    assert extract_template_params("") == []
    assert extract_template_params(None) == []


def test_has_params():
    assert has_template_params("echo {name}")
    assert not has_template_params("echo hello")


def test_ignores_malformed_braces():
    assert extract_template_params("echo {a} and }b{ and {{c}}") == ["a", "c"]
