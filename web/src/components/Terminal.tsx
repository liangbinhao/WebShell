import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import {
  buildTerminalWsUrl,
  type ConnectionState,
  type ServerMessage,
} from '../api/terminal';
import {
  getTerminalTheme,
  resolveTerminalThemeId,
  type AppearanceSettings,
} from '../lib/appearance';

export interface TerminalHandle {
  /** 向终端插入文本（不自动执行，用户按 Enter 执行） */
  insertText: (text: string) => void;
  focus: () => void;
  reconnect: () => void;
}

interface TerminalProps {
  serverId: string;
  /** 当前 tab 是否为激活 tab（激活时才执行 fit/resize） */
  active: boolean;
  /** 连接状态变化回调（同步给 Tab 栏/状态条） */
  onStatusChange: (state: ConnectionState, errorMessage?: string) => void;
  /** 检测到用户执行了一条命令（按 Enter） */
  onCommand: (command: string) => void;
  /** 全局外观设置（UI 主题/缩放/终端显示，见 lib/appearance.ts） */
  appearance: AppearanceSettings;
}

/**
 * xterm.js 终端封装：
 * - 每个实例一个独立 WebSocket -> 后端独立 SSH Session（CONTRACT.md §4）
 * - 键盘输入 -> ws input 消息；远程输出 -> term.write
 * - 尺寸变化 -> ws resize 消息
 * - 连接状态 -> status/error 消息驱动
 */
const TerminalComponent = forwardRef<TerminalHandle, TerminalProps>(
  function TerminalComponent(
    { serverId, active, onStatusChange, onCommand, appearance },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement>(null);
    const termRef = useRef<XTerm | null>(null);
    const fitRef = useRef<FitAddon | null>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const disposedRef = useRef(false);
    const intentionalCloseRef = useRef(false);
    // 当前输入行缓存（用于命令历史识别，启发式，不要求精确）
    const inputBufferRef = useRef('');
    const onStatusRef = useRef(onStatusChange);
    const onCommandRef = useRef(onCommand);

    onStatusRef.current = onStatusChange;
    onCommandRef.current = onCommand;

    const setStatus = useCallback((next: ConnectionState) => {
      onStatusRef.current(next);
    }, []);

    const send = useCallback((msg: unknown) => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
        return true;
      }
      return false;
    }, []);

    const fitTerminal = useCallback(() => {
      const term = termRef.current;
      const fit = fitRef.current;
      if (!term || !fit || disposedRef.current) return;
      try {
        fit.fit();
        const { cols, rows } = term;
        if (cols > 0 && rows > 0) {
          send({ type: 'resize', cols, rows });
        }
      } catch {
        // 容器不可见（display:none / 尺寸为 0）时 fit 会失败，忽略
      }
    }, [send]);

    // 处理用户输入：转发 + 历史识别
    const handleData = useCallback(
      (data: string) => {
        // 从 xterm buffer 读取当前行的完整文本（含远端 Tab 补全/方向键调出的历史）。
        // 必须在 Enter 发送前读取——发送后远端回显换行，buffer 光标行已不在命令行上。
        const readScreenCommand = (): string | null => {
          const term = termRef.current;
          if (!term) return null;
          try {
            const buffer = term.buffer.active;
            const line = buffer.getLine(buffer.cursorY);
            if (!line) return null;
            const raw = line.translateToString(false).trimEnd();
            if (!raw) return null;
            // 正向扫描找"提示符符号($#>) + 空格/行尾"的候选，取最后一个。
            // 约束"符号后紧跟空格"天然排除命令内的 $VAR（$ 后是字母）与 $(（后是括号）；
            // 取最后一个是因为命令内偶尔出现的 "$ x" 形态罕见，提示符几乎总是行内最后
            // 一个 "$#" 后跟空格的符号。
            let cut = -1;
            for (let i = 0; i < raw.length; i++) {
              const ch = raw[i];
              if (
                (ch === '$' || ch === '#' || ch === '>') &&
                (i + 1 >= raw.length || raw[i + 1] === ' ' || raw[i + 1] === '\t')
              ) {
                cut = i;
              }
            }
            if (cut < 0) return null;
            const cmd = raw.slice(cut + 1).trim();
            return cmd || null;
          } catch {
            return null;
          }
        };

        if (data === '\r') {
          // Enter：先读屏幕行（Enter 前的完整命令行，含补全/方向键调出的历史），
          // 再发送 Enter（发送后远端回显换行，行内容即失效）。
          const screenCmd = readScreenCommand();
          const typed = inputBufferRef.current.trim();
          inputBufferRef.current = '';
          // 屏幕行命令必须"以用户输入为前缀"才可信（说明是同一命令行被补全/历史扩展），
          // 否则可能是误读了其他行（如输出流滚动），回退用户实际输入。
          let cmd: string;
          if (screenCmd && typed && screenCmd.startsWith(typed)) {
            cmd = screenCmd;
          } else if (screenCmd && !typed) {
            // 用户没输入但屏幕有命令（↑ 调出历史后直接回车）：屏幕行可信
            cmd = screenCmd;
          } else {
            cmd = typed || screenCmd || '';
          }
          send({ type: 'input', data });
          if (cmd) onCommandRef.current(cmd);
        } else if (data.includes('\r')) {
          // 粘贴的多行文本（先发再处理缓存，多行中每个 Enter 都应执行）
          send({ type: 'input', data });
          const parts = data.split('\r');
          const first = (inputBufferRef.current + parts[0]).trim();
          inputBufferRef.current = '';
          if (first) onCommandRef.current(first);
          const last = parts[parts.length - 1].replace(/[\x00-\x1f\x7f]/g, '');
          if (last) inputBufferRef.current += last;
        } else {
          send({ type: 'input', data });
          if (data === '\x7f') {
            inputBufferRef.current = inputBufferRef.current.slice(0, -1);
          } else if (data === '\x03' || data === '\x04' || data === '\x0c') {
            // Ctrl+C / Ctrl+D / Ctrl+L：中止当前输入
            inputBufferRef.current = '';
          } else if (!data.startsWith('\x1b') && data !== '\r') {
            // 可打印字符；转义序列（方向键等）不进入历史缓存
            const printable = data.replace(/[\x00-\x1f\x7f]/g, '');
            if (printable) inputBufferRef.current += printable;
          }
        }
      },
      [send],
    );

    const connect = useCallback(() => {
      if (disposedRef.current) return;
      intentionalCloseRef.current = false;
      const term = termRef.current;
      // 连接前先 fit 拿到实际尺寸，通过 URL 传给后端 → start() 一开始就用
      // 正确尺寸创建 PTY（cmd/ConPTY 启动时即知道屏幕大小，避免 ↑ 历史跳行）
      let cols = 120;
      let rows = 30;
      try {
        fitRef.current?.fit();
        if (term && term.cols > 0 && term.rows > 0) {
          cols = term.cols;
          rows = term.rows;
        }
      } catch {
        // 容器不可见时 fit 失败，用默认值
      }
      const ws = new WebSocket(buildTerminalWsUrl(serverId, cols, rows));
      wsRef.current = ws;
      setStatus('connecting');

      ws.onopen = () => {
        if (wsRef.current !== ws) return;
        // 连接建立后立即同步一次 PTY 尺寸
        fitTerminal();
      };

      ws.onmessage = (ev) => {
        if (wsRef.current !== ws) return;
        let msg: ServerMessage;
        try {
          msg = JSON.parse(ev.data as string) as ServerMessage;
        } catch {
          // 容错：非 JSON 原始输出直接写入
          if (typeof ev.data === 'string' && term) term.write(ev.data);
          return;
        }
        if (msg.type === 'output') {
          term?.write(msg.data);
        } else if (msg.type === 'status') {
          setStatus(msg.state);
        } else if (msg.type === 'error') {
          setStatus('error');
          term?.write(`\r\n\x1b[31m${msg.message}\x1b[0m\r\n`);
        }
      };

      ws.onerror = () => {
        if (wsRef.current !== ws) return;
        setStatus('error');
      };

      ws.onclose = () => {
        if (wsRef.current !== ws) return;
        if (!intentionalCloseRef.current) {
          setStatus('disconnected');
          term?.write('\r\n\x1b[31mConnection lost\x1b[0m\r\n');
        }
      };
    }, [serverId, fitTerminal, setStatus]);

    const reconnect = useCallback(() => {
      const old = wsRef.current;
      if (old) {
        intentionalCloseRef.current = true;
        old.close();
        wsRef.current = null;
      }
      inputBufferRef.current = '';
      connect();
    }, [connect]);

    const insertText = useCallback(
      (text: string) => {
        if (!text) return;
        // 只发送输入，不本地渲染（远程 PTY 会回显），避免双重回显
        const ok = send({ type: 'input', data: text });
        if (ok) {
          inputBufferRef.current += text.replace(/[\x00-\x1f\x7f]/g, '');
          termRef.current?.focus();
        }
      },
      [send],
    );

    useImperativeHandle(
      ref,
      () => ({
        insertText,
        focus: () => termRef.current?.focus(),
        reconnect,
      }),
      [insertText, reconnect],
    );

    // 初始化 xterm + WebSocket
    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;
      disposedRef.current = false;

      const term = new XTerm({
        cursorBlink: true,
        fontSize: appearance.terminal.fontSize,
        fontFamily: appearance.terminal.fontFamily,
        lineHeight: 1.2,
        scrollback: 10000,
        theme: getTerminalTheme(resolveTerminalThemeId(appearance)).theme,
        convertEol: false,
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(el);
      termRef.current = term;
      fitRef.current = fit;

      const dataDisposable = term.onData(handleData);

      // ---- 复制 / 粘贴（Ctrl+Shift+C / Ctrl+Shift+V；选中文本时 Ctrl+C 复制）----
      // 浏览器不允许 JS 读取剪贴板，所以粘贴需要用户按 Ctrl+Shift+V（xterm 会触发
      // paste 事件）或由浏览器弹授权；这里拦截 Ctrl+Shift+C 复制、Ctrl+Shift+V 交给
      // 浏览器默认粘贴、以及选中文本时 Ctrl+C 改为复制（不向远端发送中断）。
      const copySelection = () => {
        if (!term.hasSelection()) return false;
        const sel = term.getSelection();
        navigator.clipboard
          .writeText(sel)
          .catch(() => {
            // 剪贴板不可用（非安全上下文等）时回退到 textarea 选中复制
            const ta = term.textarea;
            if (ta) {
              ta.value = sel;
              ta.select();
              document.execCommand('copy');
              ta.value = '';
            }
          });
        return true;
      };

      const customKeyHandler = (ev: KeyboardEvent): boolean => {
        const mod = ev.ctrlKey || ev.metaKey;
        const shift = ev.shiftKey;
        // Ctrl+Shift+C：复制（终端惯例）
        if (mod && shift && !ev.altKey && (ev.key === 'C' || ev.key === 'c')) {
          ev.preventDefault();
          copySelection();
          return false; // 不再传给 xterm
        }
        // Ctrl+Shift+V：粘贴——不拦截，交给浏览器触发 paste 事件
        if (mod && shift && !ev.altKey && (ev.key === 'V' || ev.key === 'v')) {
          // 由 xterm 默认处理（textarea focus + 浏览器粘贴）
          return true;
        }
        // 选中文本时 Ctrl+C：复制而不是中断
        if (mod && !shift && (ev.key === 'C' || ev.key === 'c') && term.hasSelection()) {
          ev.preventDefault();
          copySelection();
          return false;
        }
        // 其余键（含无选中的 Ctrl+C 中断）正常传给远端
        return true;
      };
      term.attachCustomKeyEventHandler(customKeyHandler);
      // 粘贴支持：xterm 的 textarea 需要 focus 才能接收浏览器 paste 事件，
      // 终端自带 textarea 由 xterm 管理，open 后即就绪，无需额外处理。

      const observer = new ResizeObserver(() => fitTerminal());
      observer.observe(el);

      connect();
      // 首次渲染后 fit（等容器有实际尺寸）
      const raf = requestAnimationFrame(() => fitTerminal());

      return () => {
        disposedRef.current = true;
        cancelAnimationFrame(raf);
        observer.disconnect();
        dataDisposable.dispose();
        const ws = wsRef.current;
        if (ws) {
          intentionalCloseRef.current = true;
          ws.close();
          wsRef.current = null;
        }
        term.dispose();
        termRef.current = null;
        fitRef.current = null;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [serverId]);

    // 外观变化时实时更新：终端字号 / 字体 / 配色（xterm options 运行时生效）
    useEffect(() => {
      const term = termRef.current;
      if (!term || disposedRef.current) return;
      term.options.fontSize = appearance.terminal.fontSize;
      term.options.fontFamily = appearance.terminal.fontFamily;
      term.options.theme = getTerminalTheme(resolveTerminalThemeId(appearance)).theme;
      // 字号/字体变化后重算网格尺寸并同步远程 PTY
      fitTerminal();
      // 激活 tab 时聚焦，保证调整设置后可直接输入
      if (active) term.focus();
    }, [appearance, active, fitTerminal]);

    // 从隐藏切换为激活时重新 fit（display:none 期间尺寸为 0）
    useEffect(() => {
      if (active) {
        const raf = requestAnimationFrame(() => fitTerminal());
        return () => cancelAnimationFrame(raf);
      }
    }, [active, fitTerminal]);

    return (
      <div
        ref={containerRef}
        className="h-full w-full overflow-hidden px-2 py-1"
        aria-label="terminal"
      />
    );
  },
);

export { TerminalComponent as Terminal };
