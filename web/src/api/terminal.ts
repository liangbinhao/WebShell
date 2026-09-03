// WebSocket 终端消息 —— 严格遵循 CONTRACT.md §4

/** 连接状态（requirements.md §6.1） */
export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error';

// ---- 服务端 -> 客户端 ----
export interface StatusMessage {
  type: 'status';
  state: 'connecting' | 'connected' | 'disconnected';
}

export interface OutputMessage {
  type: 'output';
  data: string;
}

export interface ErrorMessage {
  type: 'error';
  message: string;
}

export type ServerMessage = StatusMessage | OutputMessage | ErrorMessage;

// ---- 客户端 -> 服务端 ----
export interface InputMessage {
  type: 'input';
  data: string;
}

export interface ResizeMessage {
  type: 'resize';
  cols: number;
  rows: number;
}

export type ClientMessage = InputMessage | ResizeMessage;

/**
 * 构造终端 WebSocket URL（走 vite proxy）。
 * cols/rows：初始终端尺寸，后端 start() 用它创建 PTY（cmd/ConPTY 启动即知屏幕大小）。
 */
export function buildTerminalWsUrl(serverId: string, cols?: number, rows?: number): string {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  let url = `${proto}://${window.location.host}/ws/terminal?server_id=${encodeURIComponent(serverId)}`;
  if (cols && rows) {
    url += `&cols=${Math.round(cols)}&rows=${Math.round(rows)}`;
  }
  return url;
}
