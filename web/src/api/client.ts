// REST API 客户端 —— 路径与字段严格遵循 CONTRACT.md §3
import type {
  Command,
  CommandInput,
  HistoryEntry,
  HistoryInput,
  Server,
  ServerInput,
} from '../types';

export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
      ...init,
    });
  } catch (err) {
    // 网络错误（后端未启动等），给出友好提示而不是让页面崩溃
    throw new ApiError('无法连接后端服务，请确认后端已启动 (127.0.0.1:8000)', 0);
  }

  if (!res.ok) {
    let message = `请求失败 (HTTP ${res.status})`;
    try {
      const body = (await res.json()) as { detail?: unknown; error?: unknown };
      if (typeof body?.detail === 'string') message = body.detail;
      else if (typeof body?.error === 'string') message = body.error;
    } catch {
      // 响应体不是 JSON，保留默认信息
    }
    throw new ApiError(message, res.status);
  }

  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  body: JSON.stringify(body),
});

// ---- 服务器 (CONTRACT.md §3) ----
export const serversApi = {
  /** GET /api/servers */
  list: () => request<Server[]>('/api/servers'),
  /** POST /api/servers */
  create: (data: ServerInput) => request<Server>('/api/servers', jsonInit('POST', data)),
  /** PUT /api/servers/{id}（password 缺省表示不修改密码） */
  update: (id: string, data: Partial<ServerInput>) =>
    request<Server>(`/api/servers/${encodeURIComponent(id)}`, jsonInit('PUT', data)),
  /** DELETE /api/servers/{id} */
  remove: (id: string) =>
    request<void>(`/api/servers/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  /** PATCH /api/servers/{id}/favorite */
  toggleFavorite: (id: string, favorite: boolean) =>
    request<Server>(
      `/api/servers/${encodeURIComponent(id)}/favorite`,
      jsonInit('PATCH', { favorite }),
    ),
  /** POST /api/servers/import-ssh-config */
  importSshConfig: () =>
    request<{ added: number; skipped: number }>('/api/servers/import-ssh-config', {
      method: 'POST',
    }),
};

// ---- 命令 (CONTRACT.md §3) ----
export const commandsApi = {
  /** GET /api/commands（支持 ?category= 过滤） */
  list: (category?: string) =>
    request<Command[]>(
      `/api/commands${category ? `?category=${encodeURIComponent(category)}` : ''}`,
    ),
  /** POST /api/commands */
  create: (data: CommandInput) => request<Command>('/api/commands', jsonInit('POST', data)),
  /** PUT /api/commands/{id} */
  update: (id: string, data: Partial<CommandInput>) =>
    request<Command>(`/api/commands/${encodeURIComponent(id)}`, jsonInit('PUT', data)),
  /** DELETE /api/commands/{id} */
  remove: (id: string) =>
    request<void>(`/api/commands/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  /** PATCH /api/commands/{id}/favorite */
  toggleFavorite: (id: string, favorite: boolean) =>
    request<Command>(
      `/api/commands/${encodeURIComponent(id)}/favorite`,
      jsonInit('PATCH', { favorite }),
    ),
  /** GET /api/commands/categories */
  categories: () => request<string[]>('/api/commands/categories'),
};

// ---- 历史 (CONTRACT.md §3) ----
export const historyApi = {
  /** GET /api/history（?q= 搜索命令内容；?server_id= 过滤） */
  list: (q?: string, serverId?: string) => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (serverId) params.set('server_id', serverId);
    const qs = params.toString();
    return request<HistoryEntry[]>(`/api/history${qs ? `?${qs}` : ''}`);
  },
  /** POST /api/history —— 前端在用户执行命令时调用 */
  record: (data: HistoryInput) => request<HistoryEntry>('/api/history', jsonInit('POST', data)),
  /** DELETE /api/history/{id} */
  remove: (id: string) =>
    request<void>(`/api/history/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};
