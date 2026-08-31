// 与 CONTRACT.md §2 数据模型保持一致的 TypeScript 类型
// 字段名严格遵循接口契约，禁止自由发挥。

/** 认证方式 */
export type AuthType = 'password' | 'key';

/** Server（服务器）—— GET 响应中不包含 password/passphrase */
export interface Server {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  auth_type: AuthType;
  key_path?: string;
  proxy_jump: string[];
  favorite: boolean;
  created_at: number;
  updated_at: number;
}

/** Server 创建/更新提交体（password/passphrase 仅在此出现，响应中永不返回） */
export interface ServerInput {
  name: string;
  host: string;
  port: number;
  username: string;
  auth_type: AuthType;
  password?: string;
  key_path?: string;
  passphrase?: string;
  proxy_jump: string[];
  favorite: boolean;
}

/** Command（常用命令） */
export interface Command {
  id: string;
  name: string;
  content: string;
  category: string;
  description: string;
  favorite: boolean;
  created_at: number;
  updated_at: number;
}

/** Command 创建/更新提交体 */
export interface CommandInput {
  name: string;
  content: string;
  category: string;
  description: string;
  favorite: boolean;
}

/** HistoryEntry（命令历史） */
export interface HistoryEntry {
  id: string;
  server_id: string;
  server_name: string;
  username: string;
  command: string;
  executed_at: number;
}

/** History 记录提交体（前端在用户执行命令时调用） */
export interface HistoryInput {
  server_id: string;
  server_name: string;
  username: string;
  command: string;
}
