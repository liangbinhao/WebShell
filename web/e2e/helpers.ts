/**
 * E2E 测试辅助：数据准备与清理（Playwright Best Practices：控制测试数据、测试隔离）。
 *
 * 通过 Playwright 的 request 上下文直接调用后端 REST API（绕过 UI 填表，
 * 使测试聚焦用户旅程；UI 层的新增表单在旅程测试中单独覆盖）。
 */
import type { APIRequestContext } from '@playwright/test';

export const BACKEND = 'http://127.0.0.1:8000';

export interface CreatedServer {
  id: string;
  name: string;
}

/** 创建一台测试服务器（指向 127.0.0.1:22——本机一般无 sshd，用于验证连接错误状态机） */
export async function createServer(
  request: APIRequestContext,
  name: string,
  overrides: Record<string, unknown> = {},
): Promise<CreatedServer> {
  const res = await request.post(`${BACKEND}/api/servers`, {
    data: {
      name,
      host: '127.0.0.1',
      port: 22,
      username: 'e2e',
      auth_type: 'password',
      password: 'e2e-pass',
      ...overrides,
    },
  });
  if (!res.ok()) {
    throw new Error(`创建测试服务器失败: ${res.status()} ${await res.text()}`);
  }
  return (await res.json()) as CreatedServer;
}

/** 清理测试服务器（按名字前缀删除，保证测试隔离、无残留） */
export async function cleanupServers(request: APIRequestContext, namePrefix: string): Promise<void> {
  const list = await (await request.get(`${BACKEND}/api/servers`)).json();
  const targets = (list as { id: string; name: string }[]).filter((s) =>
    s.name.startsWith(namePrefix),
  );
  for (const s of targets) {
    await request.delete(`${BACKEND}/api/servers/${s.id}`);
  }
}

/** 命令前缀：所有 E2E 数据用该前缀，便于清理与识别 */
export const E2E_PREFIX = 'E2E-';
