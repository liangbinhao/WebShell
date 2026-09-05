---
name: feature-development
description: 功能开发流程与文档联动规则。开始功能开发、改对外接口/行为、改 UI/外观/设置、需要同步文档前必读。含开发顺序、变更类型与文档对照表、"只改代码"禁止条款。
whenToUse: 功能开发（新功能/修复/重构）、改动 REST/WebSocket 契约、UI/外观/设置项、模块 README 或 CHANGELOG 需要同步时。
---

# 开发流程与文档联动

## 功能开发顺序

1. 定位需求文档对应章节（`docs/project/requirements.md`：功能需求 → 验收标准）；
2. 明确接口契约：REST 路径、WebSocket 消息格式、数据模型（以 `docs/project/CONTRACT.md` 为准）；
3. 后端先行实现（API / WebSocket / SSH 会话），再实现前端对接；
4. 实现后补充或更新测试（见 `testing-strategy` skill）；
5. 更新受影响的文档（`docs/project/requirements.md`、`docs/project/API.md`、README 等）。

## 变更类型与文档联动

改动对**对外接口/行为**有影响（REST、WebSocket 消息、UI 功能、设置项、外观）时，必须同步受影响文档：

| 改动范围 | 必须同步的文档 |
|---|---|
| REST / WebSocket 契约 | `docs/project/CONTRACT.md`、`docs/project/API.md` |
| 功能/UI/外观/设置 | `docs/project/requirements.md` 对应章节、`web/README.md`（如涉及前端） |
| 后端模块/测试/运行 | `backend/README.md` |
| 项目总览 | 根 `README.md`（功能特性、目录结构） |
| 版本记录 | `CHANGELOG.md` |

- **内部重构 / 纯性能**（行为不变）：只需测试无回归，文档可不动；
- **改动会改变用户可见行为**：文档必须同步，禁止"只改代码"。

## 约定

- API 变更必须同步前端 API 层，禁止前后端各写一份不一致的契约；
- WebSocket 消息需定义消息类型字段（如 `type`），新增类型时同步文档；
- 前后端并行开发时，先以契约（接口定义）为准，接口变更需提前说明；
- 涉及 SSH 会话、终端数据流的改动，必须验证断线、异常关闭等边界场景；
- 完成一个功能模块后再开始下一个，避免多个半成品模块堆积；
- 改动应先建立任务清单（todo），跟踪：代码点 + 受影响测试 + 受影响文档，三者都覆盖才算完成。
