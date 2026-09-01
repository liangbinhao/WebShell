# Web SSH Workspace — 前端 (web/)

React 18 + Vite + TypeScript + xterm.js + shadcn/ui(Tailwind) 实现的前端。

## 一键构建（供项目根目录 script/build.sh 调用）

```bash
cd web
npm install      # 依赖安装（已配置 npmmirror registry + 项目本地缓存，见 .npmrc）
npm run build    # tsc --noEmit 类型检查 + vite 产物构建（输出 dist/）
```

即：**`npm install && npm run build`** 一条命令完成构建（CI 友好、可重复执行）。

## 开发启动（供项目根目录 script/run.sh 调用）

```bash
cd web
npm run dev
```

- **host / port**：`127.0.0.1:5173`（在 `vite.config.ts` 中显式指定）
- **代理**：`/api` → `http://127.0.0.1:8000`，`/ws` → `ws://127.0.0.1:8000`（`ws: true`）
- 终端 WebSocket：`ws://<host>/ws/terminal?server_id=<id>`
- 生产预览：`npm run preview`

## 环境变量与前置条件

| 项 | 要求 |
|---|---|
| Node.js | ≥ 18（开发环境为 v24.14.1；Vite 5 要求 Node 18+） |
| npm | 随 Node 提供（v11.11.0） |
| 后端 | 建议运行在 `127.0.0.1:8000`（FastAPI）。**非必需**：后端未启动时前端仍可打开，REST 请求显示错误提示 + 重试，不崩溃 |
| 网络 | 安装依赖走 npmmirror 镜像（`web/.npmrc`）；如机器 `~/.npm` 缓存损坏（root 属主），本项目使用本地缓存 `web/.npm-cache` 规避，无需额外配置 |
| 环境变量 | 前端本身无需任何环境变量；全部连接目标（8000/5173）由 `vite.config.ts` 固定 |

## 项目级脚本（WebShell/script/ 目录，CONTRACT.md §8.2）

四个脚本统一放在项目根目录的 `script/` 下，从项目根目录执行：

```bash
./script/build.sh   # 安装依赖并构建（uv 后端依赖 + npm 前端）
./script/run.sh     # 启动后端(8000) + 前端(5173)，PID 记录到 .run/
./script/stop.sh    # 按 .run/ 停止后端与前端
./script/clean.sh   # 清理 backend/.venv、web/node_modules、web/dist、.run/ 等（不删源码）
```

## 目录结构

```text
web/src
├── App.tsx                 # 三栏布局 + Toast
├── api/
│   ├── client.ts           # REST 客户端（路径/字段遵循 CONTRACT.md §3）
│   └── terminal.ts         # WebSocket 消息类型 + URL 构造（CONTRACT.md §4）
├── components/
│   ├── ServersPanel.tsx    # 左栏：服务器列表 + CRUD + 收藏
│   ├── ServerFormDialog.tsx
│   ├── TerminalTabs.tsx    # 中栏：多 Tab 终端
│   ├── Terminal.tsx        # xterm.js 封装（WS 生命周期 / resize / 历史识别 / 显示设置）
│   ├── CommandsPanel.tsx   # 右栏：命令库（分类分组 + 模板）
│   ├── CommandFormDialog.tsx
│   ├── TemplateDialog.tsx  # {参数名} 模板参数表单
│   ├── HistoryPanel.tsx    # 右栏 Tab：命令历史（搜索/删除/重插）
│   ├── SettingsPanel.tsx   # 右栏 Tab：终端显示设置（字号/字体/配色）
│   ├── RightPanel.tsx
│   └── ui/                 # shadcn/ui 组件（button/dialog/select/tabs/...）
├── lib/                    # cn / 时间格式化 / 模板占位符解析 / terminal-settings
└── types.ts                # 与 CONTRACT.md §2 一致的模型类型
```

## 终端显示设置

右栏「设置」Tab（见需求 §15.1）：

- **字体大小**：10–20px（滑块 + +/-），`term.options.fontSize` 实时生效
- **字体**：7 种预置等宽字体，`term.options.fontFamily`
- **配色方案**：暗色默认 / 亮色 / 绿色 CRT（含 ANSI 16 色），`term.options.theme`
- 持久化：`localStorage`（key `ws-terminal-settings`），全局共享，运行时更新不重建终端

相关文件：`src/lib/terminal-settings.ts`（类型/默认值/预置）、`src/components/SettingsPanel.tsx`（UI）。

## 说明

- 命令/历史点击后只**插入**终端，不自动执行（用户按 Enter 执行，降低误操作风险）。
- 命令执行（按 Enter）时前端自动调用 `POST /api/history` 记录历史（启发式识别输入行，vim/top 等全屏程序内无法精确识别）。
- 切换 Tab 不会断开其他会话（非激活终端保持挂载与连接）。
- 每个 Tab 独立 WebSocket 连接，关闭 Tab 即释放对应 SSH 会话。
