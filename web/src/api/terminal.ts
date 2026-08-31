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

/** 构造终端 WebSocket URL：ws://<当前host>/ws/terminal?server_id=<id>（走 vite proxy） */
export function buildTerminalWsUrl(serverId: string): string {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.host}/ws/terminal?server_id=${encodeURIComponent(serverId)}`;
}
