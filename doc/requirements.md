# Web SSH Workspace 需求规格说明书

## 1. 项目概述

### 1.1 项目名称

Web SSH Workspace

### 1.2 项目背景

日常开发工作中需要频繁通过 SSH 连接不同的远程 Linux 服务器。目前办公电脑为 Windows 系统，公司环境不允许随意安装外部软件，现有可使用的 SSH 客户端主要为 Xshell、Moba 等工具。

现有工具能够满足基本 SSH 连接需求，但在服务器较多、需要频繁执行固定命令以及需要同时连接多个服务器时，存在以下问题：

* 服务器连接信息需要手动管理；
* 常用命令需要反复输入或依赖客户端自身的命令记录；
* 不同项目、不同服务器之间切换不够方便；
* 多个 SSH 会话管理体验较为繁琐；
* 常用操作缺乏统一的快捷入口。

因此，希望开发一个面向个人使用的 Web SSH Workspace，通过浏览器提供统一的 SSH 工作环境。

用户只需要打开浏览器即可访问 Web SSH Workspace，无需在 Windows 办公电脑上额外安装 SSH 客户端。

---

# 2. 项目目标

本项目第一阶段的目标不是构建企业级堡垒机，而是实现一个**个人使用的 Web SSH 工作台**。

核心目标：

1. 能够通过浏览器连接远程 Linux 服务器；
2. 提供接近原生 Shell 的交互式终端体验；
3. 支持多个服务器配置和快速连接；
4. 支持多个 SSH 会话；
5. 提供个人常用命令库；
6. 支持命令历史记录；
7. 支持命令模板；
8. 后续可以扩展 Workspace、文件传输等能力。

项目应优先保证核心 SSH 使用体验，而不是追求复杂的企业级用户管理、权限管理和审计能力。

---

# 3. 用户范围

当前版本仅面向单个用户使用。

因此第一阶段：

* 不需要注册功能；
* 不需要多用户系统；
* 不需要复杂 RBAC；
* 不需要多租户；
* 不需要企业 SSO；
* 不需要管理员后台；
* 不需要复杂的审计系统。

但是系统设计应避免严重阻碍未来增加这些能力。

---

# 4. 整体技术方案

## 4.1 前端

前端使用：

* React（Vite + TypeScript）
* xterm.js（浏览器终端模拟器）
* shadcn/ui + Tailwind CSS（UI 组件与样式）

技术选型理由：

* React 组件化契合三栏布局、多 Tab、服务器列表、命令库等界面结构；
* shadcn/ui 提供现代、精致的工具型界面观感（接近 Tabby / WindTerm 等终端工具），深色主题与紧凑密度开箱即用，组件按需复制、无包体积包袱；
* 前端按模块拆分，与后端 API / WebSocket 通过统一的 API 层对接。

浏览器负责：

* 展示 Terminal；
* 接收键盘输入；
* 展示远程 Shell 输出；
* 与后端建立 WebSocket 连接；
* 服务器管理、命令库、命令历史等界面交互。

---

## 4.2 后端

后端使用：

* Python
* FastAPI
* WebSocket
* AsyncSSH

技术选型理由：

* 团队主力语言为 Python，FastAPI + AsyncSSH 是 Python 生态中最成熟的异步 SSH 方案；
* 后端仅承担 SSH 连接管理、会话生命周期、API 与 WebSocket 服务，不渲染任何前端页面（前后端分离）。

后端负责：

* SSH 连接建立；
* SSH 身份认证；
* PTY / Shell 会话建立；
* Terminal 输入输出转发；
* WebSocket 会话管理；
* SSH 会话生命周期管理；
* 服务器配置管理；
* 常用命令管理。

---

## 4.3 通信架构

核心数据流：

```text
Browser
   |
   | xterm.js
   |
   | WebSocket
   v
FastAPI
   |
   | AsyncSSH
   v
Remote Linux Server
   |
   | Shell / PTY
   v
Remote Shell
```

终端输入：

```text
Keyboard
   ↓
xterm.js
   ↓
WebSocket
   ↓
FastAPI
   ↓
AsyncSSH
   ↓
Remote Shell
```

终端输出：

```text
Remote Shell
   ↓
AsyncSSH
   ↓
FastAPI
   ↓
WebSocket
   ↓
xterm.js
   ↓
Terminal
```

---

# 5. 核心功能需求

## 5.1 服务器管理

系统需要提供服务器列表。

每个服务器至少包含：

* 服务器名称；
* Host；
* SSH Port；
* Username；
* 认证方式；
* 是否收藏。

示例：

```yaml
servers:
  - name: DEV-01
    host: 10.10.1.20
    port: 22
    username: developer

  - name: TEST-01
    host: 10.10.2.20
    port: 22
    username: developer
```

用户可以：

* 查看服务器列表；
* 新增服务器；
* 编辑服务器；
* 删除服务器；
* 收藏服务器；
* 点击服务器直接建立 SSH 连接。

---

# 6. SSH 连接

## 6.1 建立连接

用户选择服务器后，系统建立 SSH 连接。

连接状态至少包括：

```text
Connecting
Connected
Disconnected
Error
```

终端顶部应能够显示当前连接的服务器名称和连接状态。

---

## 6.2 SSH 认证

第一阶段支持：

* Username + Password；
* SSH Private Key；
* 跳板机（ProxyJump）：目标服务器无法直连时，可按顺序经过一个或多个已配置的跳板服务器建立连接（多跳支持）。用户在服务器配置中指定跳板链，连接过程对终端用户透明，体验与直连一致。

密码不应以明文形式长期保存。

SSH Private Key 不应通过普通 API 返回给浏览器。

---

# 7. 交互式 Shell

这是整个系统最核心的功能。

系统必须建立真正的 SSH Shell / PTY 会话，而不是简单执行：

```text
ssh exec command
```

必须尽可能支持标准交互式 Shell 行为。

至少需要支持：

* 普通命令输入；
* Enter；
* Backspace；
* ↑ / ↓；
* ← / →；
* Tab；
* Ctrl+C；
* Ctrl+D；
* Ctrl+L；
* ANSI 输出；
* Terminal resize。

需要尽可能保证以下程序可以正常运行：

```bash
vim
top
python
ssh
tmux
```

第一阶段不要求完美兼容所有终端程序，但架构必须基于 PTY / interactive shell，而不是简单的 command execution。

---

# 8. Terminal 多会话

系统需要支持多个 Terminal Tab。

例如：

```text
┌ DEV-01 × ┐ ┌ DEV-02 × ┐ ┌ TEST-01 × ┐
```

每个 Tab 对应独立 SSH Session。

要求：

* 每个 Tab 独立维护 SSH 会话；
* 切换 Tab 不应导致其他会话断开；
* 可以关闭单个 Tab；
* 可以创建新的 Terminal；
* 连接断开后能够显示明确状态。

第一阶段暂不要求跨浏览器刷新后恢复 SSH Session。

---

# 9. Terminal Split

第一阶段（MVP）不实现 Split，但架构（会话模型、终端组件）必须预留扩展能力。

第二阶段目标形式：

```text
┌────────────────────┬────────────────────┐
│ DEV-01             │ DEV-02             │
│                    │                    │
│ $                  │ $                  │
│                    │                    │
└────────────────────┴────────────────────┘
```

不同区域可以对应不同 SSH Session。

---

# 10. 常用命令库

系统需要提供个人常用命令管理功能。

命令至少包含：

* 名称；
* 命令内容；
* 分类；
* 描述；
* 是否收藏。

例如：

```text
Linux
├── 查看磁盘
│   └── df -h
│
├── 查看内存
│   └── free -h
│
Docker
├── 查看容器
│   └── docker ps
│
└── 查看日志
    └── docker logs -f {container}
```

---

# 11. 命令模板

系统需要支持带参数的命令模板。

例如：

```text
docker logs --tail {lines} -f {container}
```

用户点击命令后：

```text
Container:
[ app-service ]

Lines:
[ 500 ]
```

系统生成：

```bash
docker logs --tail 500 -f app-service
```

默认行为：

> 命令只插入 Terminal，不自动执行。

用户需要自行确认后按 Enter 执行。

这样可以降低误操作风险。

---

# 12. 命令历史

系统应记录用户通过 Web SSH Terminal 执行过的命令。

历史信息至少包含：

* 时间；
* 服务器；
* 用户；
* 命令。

支持：

* 查看历史；
* 搜索历史；
* 重新插入 Terminal；
* 删除历史记录。

第一阶段不要求记录完整 Terminal 输出。

---

# 13. Workspace

Workspace 可以作为后续功能。

一个 Workspace 可以保存：

```text
Workspace
├── Server
│   ├── DEV-01
│   └── DEV-02
│
├── Command
│   ├── 查看日志
│   └── Docker 状态
│
└── Terminal Layout
```

例如：

```text
项目 A - 测试环境
```

打开 Workspace 后，可以快速恢复：

* 常用服务器；
* Terminal 布局；
* 常用命令。

第一阶段可以暂不实现完整 Workspace，但数据模型设计应尽量避免未来扩展困难。

---

# 14. 文件操作

文件上传和下载不属于第一阶段（MVP）核心功能，**第二阶段实现**。

通过 SFTP 增加：

* 文件浏览；
* 文件上传；
* 文件下载；
* 删除；
* 创建目录。

第二阶段要求：文件传输必须复用已建立的 SSH 连接（同一跳板链），提供进度反馈，传输期间不阻塞其他会话。

---

# 15. 用户界面

整体界面建议采用三栏布局：

```text
┌────────────────────────────────────────────────────┐
│ Web SSH Workspace                                  │
├──────────────┬──────────────────────┬──────────────┤
│ Servers      │ Terminal             │ Commands     │
│              │                      │              │
│ DEV-01       │ user@dev01:~$        │ Linux        │
│ DEV-02       │                      │ Docker       │
│ TEST-01      │ $ docker ps          │ Kubernetes   │
│              │                      │ Project      │
│ [+ Add]      │                      │              │
└──────────────┴──────────────────────┴──────────────┘
```

要求：

* 界面简洁；
* 优先保证 Terminal 使用体验；
* 支持暗色主题；
* Terminal 区域应尽可能占据主要空间；
* 浏览器窗口尺寸变化时 Terminal 能够自适应。

## 15.1 终端显示设置（已实现）

终端提供显示设置（右栏「设置」Tab，全局生效、localStorage 持久化）：

* **字体大小**：10–20px 可调（滑块 + +/- 按钮），xterm `options.fontSize` 实时生效并重算网格；
* **字体**：7 种预置等宽字体（JetBrains Mono / Fira Code / Cascadia Code / Source Code Pro / Consolas / Courier New / 系统默认），xterm `options.fontFamily`；
* **配色方案**：3 套预置（暗色默认 / 亮色 / 绿色 CRT），xterm `options.theme`（含 ANSI 16 色），带预览卡片。

实现约定：

* 设置存于浏览器 `localStorage`（key `ws-terminal-settings`），刷新保留；
* 设置变更通过 `term.options` 运行时更新，不重建终端；字号/字体变化后 `fit()` 重算行列数并同步远程 PTY；
* 所有终端 Tab 共享同一套设置（全局生效）。

---

# 16. 配置管理

第一阶段不强制要求使用数据库。

*可以*根据实际实现选择：

* YAML；
* JSON；
* SQLite。

如果使用数据库，应避免为了简单配置引入过度复杂的数据库架构。

服务器配置、命令库和历史记录应彼此解耦。

---

# 17. 安全需求

虽然本项目仅供个人使用，但仍然需要遵循基本安全原则。

## 17.1 密码

禁止：

* 将 SSH 密码硬编码在源代码中；
* 将 SSH 密码提交到 Git；
* 将密码写入日志；
* 将密码返回到前端。

密码存储策略（澄清 §6.2 与本节的关系）：

* 密码认证的第一阶段采用**本机加密存储**：密码使用系统密钥环（如 `keyring` / Windows Credential Manager）或带主口令的加密文件保存，避免长期明文落盘；
* 若实现上必须使用配置文件存储，文件权限需收紧（仅当前用户可读写），且密码字段需加密（如 Fernet / AES）而非纯文本；
* 会话期间密码仅存于后端内存，不持久化到浏览器。

---

## 17.2 SSH Private Key

禁止：

* 将私钥发送到浏览器；
* 将私钥写入日志；
* 将私钥提交到 Git；
* 将私钥硬编码到项目代码。

---

## 17.3 Host Key

SSH 连接需要进行基本的 Host Key 校验。

不能为了方便而默认关闭 SSH Host Key 验证。

---

## 17.4 WebSocket

WebSocket Session 必须与对应 SSH Session 建立明确关联。

浏览器关闭连接后，应能够正确释放对应的 SSH Session。

---

# 18. 日志

系统需要记录必要的应用运行日志，例如：

* 服务启动；
* 服务停止；
* SSH 连接成功；
* SSH 连接失败；
* SSH Session 创建；
* SSH Session 关闭；
* WebSocket 连接异常。

禁止在日志中记录：

* SSH 密码；
* Private Key；
* 其他敏感认证信息。

第一阶段不要求记录用户执行的所有 Shell 命令。

---

# 19. 异常处理

需要考虑以下异常情况：

### SSH 连接失败

显示：

```text
Failed to connect to DEV-01
```

并提供合理错误信息。

### SSH 连接中断

Terminal 显示：

```text
Connection lost
```

允许用户重新连接。

### WebSocket 断开

后端需要正确释放对应资源。

### 服务器主动关闭 SSH

前端需要能够感知并显示连接状态。

### Terminal Resize

浏览器窗口改变大小时，需要将新的 Terminal 行列数同步到远程 PTY。

### 会话保活与断线感知（心跳）

个人运维场景下，长连接可能因网络抖动、公司代理空闲超时而静默断开。需要：

* 后端对 SSH 会话定期发送 keepalive（如 SSH keepalive / 心跳包），探测连接是否仍然存活；
* WebSocket 层可配合 ping/pong 心跳，及时发现浏览器与后端的连接异常；
* 断线后终端显示明确状态（如 `Connection lost`），允许用户一键重连。

---

# 20. 非功能需求

## 20.1 性能

在个人使用场景下，至少支持：

* 同时保持多个 SSH Session；
* Terminal 实时输出；
* 大量日志持续输出；
* 不因单个 SSH Session 阻塞其他 Session。

---

## 20.2 稳定性

SSH Session 出现异常时：

* 不应导致整个 Web 服务崩溃；
* 应正确释放资源；
* 其他 SSH Session 不应受到影响。

---

## 20.3 可维护性

代码应按照职责划分模块。

建议结构：

```text
app/
├── main.py
├── api/
├── websocket/
├── ssh/
│   ├── manager.py
│   ├── session.py
│   └── connection.py
├── commands/
├── servers/
├── models/
├── config/
└── utils/
```

具体目录结构可以由实现 Agent 根据实际需要调整。

---

# 21. 测试要求

至少需要包含：

## 单元测试

测试：

* Server 配置；
* Command 模板；
* Session 生命周期；
* 异常处理；
* 配置读取。

## WebSocket 测试

测试：

* 建立连接；
* 接收输入；
* 转发 SSH 输出；
* 正常关闭；
* 异常断开。

## SSH 测试

测试：

* 正常登录；
* 登录失败；
* PTY 创建；
* Shell 创建；
* Session 关闭；
* Connection lost。

## 黑盒测试

至少验证完整链路：

```text
Browser
 ↓
xterm.js
 ↓
WebSocket
 ↓
FastAPI
 ↓
AsyncSSH
 ↓
Linux Shell
```

能够完成：

```bash
pwd
ls
echo hello
```

并能够进行交互式 Shell 操作。

---

# 22. 第一阶段明确不做的功能

为了控制项目范围，以下功能第一阶段不实现：

* 多用户；
* 用户注册；
* RBAC；
* SSO；
* 企业级审计；
* 堡垒机；
* 多租户；
* 集群管理；
* Docker 管理平台；
* Kubernetes 管理平台；
* 完整 SFTP（文件操作第二阶段实现，见 §14）；
* Terminal Split（第二阶段实现，见 §9）；
* 文件编辑器；
* 在线代码编辑器；
* AI 命令生成；
* AI Agent 自动执行 Shell；
* 自动执行危险命令。

这些功能可以作为未来扩展方向，但不能影响第一阶段 MVP。

---

# 23. MVP 验收标准

项目完成后，用户可以：

1. 打开浏览器访问 Web SSH Workspace；
2. 查看配置好的服务器；
3. 点击服务器建立 SSH 连接；
4. 在 xterm.js Terminal 中看到远程 Shell；
5. 输入 Linux 命令并实时获得输出；
6. 使用 Ctrl+C、Tab、方向键等基本交互；
7. 运行 vim、top 等交互式程序进行基本验证；
8. 同时打开多个 SSH Terminal；
9. 在不同服务器之间切换；
10. 使用个人常用命令；
11. 使用命令模板生成命令；
12. 查看和搜索历史命令；
13. 通过跳板机连接的服务器可以正常建立会话（若配置了跳板链）；
14. SSH 断开后能够得到明确提示，并允许重新连接；
15. 单个 SSH Session 异常不会导致整个 Web 服务崩溃。

---

# 24. 项目成功标准

第一阶段项目是否成功，不以代码数量或功能数量作为主要判断标准，而以以下核心链路是否稳定作为主要标准：

```text
浏览器
   ↓
xterm.js
   ↓
WebSocket
   ↓
FastAPI
   ↓
AsyncSSH
   ↓
PTY
   ↓
Linux Shell
```

如果用户能够像使用普通 SSH 客户端一样，在浏览器中稳定完成日常 Linux 服务器操作，则认为 MVP 达到项目目标。

---

# 25. 后续扩展方向

在 MVP 稳定后，可以考虑：

1. Workspace；
2. Terminal Split（第二阶段，见 §9）；
3. SFTP 与文件管理（第二阶段，见 §14）；
4. SSH Key 管理；
5. 命令智能搜索；
6. 命令参数表单；
7. 更完善的 Session 恢复；
8. 命令审计；
9. 多用户；
10. RBAC；
11. SSO；
12. AI 辅助命令生成。

扩展功能必须建立在核心 SSH Terminal 稳定的基础上，不应为了提前支持未来需求而过度设计 MVP。
