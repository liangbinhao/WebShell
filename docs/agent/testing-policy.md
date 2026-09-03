# 测试策略（细则）

> 主文件：`AGENTS.md` §4（要点）。本文件为完整测试规范，**涉及测试相关工作时必读**。

## 测试分层（金字塔）

```
        E2E（Playwright）—— 浏览器全链路（web/e2e/，核心旅程，少而精）
     集成/API（pytest + TestClient）—— 路由 → 存储 → SSH(mock) 协作
   单元（pytest / Vitest）—— 纯逻辑，无 I/O、mock 依赖
```

| 层 | 工具 | 位置 | 测什么 | 原则 |
|---|---|---|---|---|
| 单元 | pytest（后端）/ Vitest（前端，可后补） | `backend/tests/` | 纯函数/类逻辑、存储、加密、模板、SSH 会话（mock 连接） | 多、快、无网络/无真实服务 |
| 集成/API | pytest + FastAPI TestClient | `backend/tests/test_*_api.py`、`test_websocket.py` | HTTP 路由 → 数据层、WebSocket 会话生命周期 | 起应用实例，SSH 用 fake/mock |
| E2E | Playwright（`@playwright/test`） | `web/e2e/` | 真实浏览器 + 真实后端全链路核心旅程 | 少而精，测用户可见行为 |

## Bug 修复流程（先红后绿）

修 bug 前**先写能复现的测试**：

1. **单元/集成可复现**（逻辑、API、组件交互）：
   - 写一个复现该 bug 的测试 → 运行确认失败（红）；
   - 修代码 → 重跑确认通过（绿），且其他测试无回归；
   - bug 改变对外行为 → 按 `development-workflow.md` 更新文档。
2. **纯视觉/审美类**（无法自动断言"好不好看"）：手动复现 + 修后手动确认，提交说明标注"视觉改动，手动验证"。

## 前端 bug 分层测试原则

| Bug 类型 | 例子 | 测试方式 |
|---|---|---|
| ① 纯逻辑 | 历史去重、补全命令提取、格式 | 单元测试（把逻辑抽成纯函数测） |
| ② 组件交互 | 按钮无响应、状态未更新、设置未持久化 | Playwright/组件测试断言 DOM 状态 |
| ③ 渲染结果 | 主题没切换、字体没生效、缩放没应用 | Playwright 断言 `computedStyle` / class / `fonts.check` |
| ④ 纯视觉 | 布局难看、配色不协调 | 截图对比或手动验证（不硬自动化） |

原则：能归为 ③（渲染状态断言）就写测试；真审美问题诚实标注手动验证。

## E2E 策略（Playwright）

**核心旅程 E2E**：真实后端（`script/run.sh` 启动）+ 真实浏览器，测用户核心操作链路。

- 框架：`@playwright/test`（官方 test runner）；
- 遵循 Playwright 官方 Best Practices：
  - **测用户可见行为**：用 `getByRole` / `getByText` 等用户可见 locator，不用 CSS class 实现细节；
  - **web-first 断言**：`await expect(x).toBeVisible()` 自动等待，禁用 `isVisible()` 手动断言；
  - **测试隔离**：每测试独立数据（E2E 中临时建服务器、测完清理）；
  - **控制测试数据**：只测本应用，mock 外部依赖；
  - **失败定位**：用 trace（失败时保留，不在每个测试开）。
- 当前核心旅程（`web/e2e/`）：
  1. 添加服务器 → 打开终端 → 状态机正确（connecting/connected/error）；
  2. 外观设置：切换主题 → 界面与终端配色联动变化；
  3. 命令库：点命令 → 插入激活终端；
  4. 终端字体：内置字体生效（`fonts.check`）。
- 运行：`cd web && npx playwright test`（需后端已启动）。

## 与 AI 协作

- **AI 擅长**：生成测试骨架、写断言、准备测试数据（setup/teardown helper）、失败归因（读 trace/日志）、批量生成用例；
- **AI 要人审**：断言是否表达真实意图（警惕"页面不报错"类弱断言）、locator 是否稳定、是否测了不该测的实现细节；
- 生成后必须**实际运行**验证绿，禁止只生成不跑。

## 验证纪律

- 新增/修改功能后运行受影响测试并报告结果；
- 无法自动验证的内容明确说明（如纯视觉、需真实 SSH 服务器）；
- 不得声称执行了未执行的测试；E2E 需后端在线，跑前确认 `script/run.sh`。
