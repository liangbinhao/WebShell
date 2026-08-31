import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';
import { Terminal as XTerm, type ITheme } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import {
  buildTerminalWsUrl,
  type ConnectionState,
  type ServerMessage,
} from '../api/terminal';

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
}

// 与暗色 UI 一致的 xterm 配色
const termTheme: ITheme = {
  background: '#09090b',
  foreground: '#e4e4e7',
  cursor: '#e4e4e7',
  cursorAccent: '#09090b',
  selectionBackground: '#3f3f46',
  black: '#18181b',
  red: '#f87171',
  green: '#4ade80',
  yellow: '#facc15',
  blue: '#60a5fa',
  magenta: '#e879f9',
  cyan: '#22d3ee',
  white: '#d4d4d8',
  brightBlack: '#3f3f46',
  brightRed: '#fca5a5',
  brightGreen: '#86efac',
  brightYellow: '#fde047',
  brightBlue: '#93c5fd',
  brightMagenta: '#f0abfc',
  brightCyan: '#67e8f9',
  brightWhite: '#fafafa',
};

/**
 * xterm.js 终端封装：
 * - 每个实例一个独立 WebSocket -> 后端独立 SSH Session（CONTRACT.md §4）
 * - 键盘输入 -> ws input 消息；远程输出 -> term.write
 * - 尺寸变化 -> ws resize 消息
 * - 连接状态 -> status/error 消息驱动
 */
const TerminalComponent = forwardRef<TerminalHandle, TerminalProps>(
  function TerminalComponent({ serverId, active, onStatusChange, onCommand }, ref) {
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
        send({ type: 'input', data });

        if (data === '\r') {
          // Enter：当前输入行视为一条已执行命令
          const cmd = inputBufferRef.current.trim();
          inputBufferRef.current = '';
          if (cmd) onCommandRef.current(cmd);
        } else if (data.includes('\r')) {
          // 粘贴的多行文本
          const parts = data.split('\r');
          const first = (inputBufferRef.current + parts[0]).trim();
          inputBufferRef.current = '';
          if (first) onCommandRef.current(first);
          const last = parts[parts.length - 1].replace(/[\x00-\x1f\x7f]/g, '');
          if (last) inputBufferRef.current += last;
        } else if (data === '\x7f') {
          inputBufferRef.current = inputBufferRef.current.slice(0, -1);
        } else if (data === '\x03' || data === '\x04' || data === '\x0c') {
          // Ctrl+C / Ctrl+D / Ctrl+L：中止当前输入
          inputBufferRef.current = '';
        } else if (!data.startsWith('\x1b') && data !== '\r') {
          // 可打印字符；转义序列（方向键等）不进入历史缓存
          const printable = data.replace(/[\x00-\x1f\x7f]/g, '');
          if (printable) inputBufferRef.current += printable;
        }
      },
      [send],
    );

    const connect = useCallback(() => {
      if (disposedRef.current) return;
      intentionalCloseRef.current = false;
      const term = termRef.current;
      const ws = new WebSocket(buildTerminalWsUrl(serverId));
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
        fontSize: 13,
        fontFamily: 'Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
        lineHeight: 1.2,
        scrollback: 10000,
        theme: termTheme,
        convertEol: false,
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(el);
      termRef.current = term;
      fitRef.current = fit;

      const dataDisposable = term.onData(handleData);
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
