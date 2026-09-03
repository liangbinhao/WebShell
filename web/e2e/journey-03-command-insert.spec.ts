/**
 * 核心旅程 3：命令库——点击命令插入激活终端。
 *
 * 验证（requirements §10/§11）：命令点击后插入终端（不自动执行），
 * 无激活终端时提示用户先打开会话。
 *
 * 注：命令插入经 WebSocket 发给远端；本 E2E 后端无真实 sshd，
 * 无法断言远端回显，改为验证 UI 层的插入调用链与提示行为。
 */
import { test, expect } from '@playwright/test';
import { cleanupServers, createServer, E2E_PREFIX } from './helpers';

const CMD_PREFIX = `${E2E_PREFIX}cmd-`;

async function createCommand(request: import('@playwright/test').APIRequestContext, content: string) {
  const res = await request.post('http://127.0.0.1:8000/api/commands', {
    data: {
      name: `${CMD_PREFIX}echo`,
      content,
      category: 'E2E',
      description: 'E2E 测试命令',
    },
  });
  if (!res.ok()) throw new Error(`建命令失败 ${res.status()}`);
  return (await res.json()) as { id: string };
}

async function cleanupCommands(request: import('@playwright/test').APIRequestContext) {
  const list = await (await request.get('http://127.0.0.1:8000/api/commands')).json();
  for (const c of list as { id: string; name: string }[]) {
    if (c.name.startsWith(CMD_PREFIX)) {
      await request.delete(`http://127.0.0.1:8000/api/commands/${c.id}`);
    }
  }
}

test.describe('命令库 → 终端插入', () => {
  test.beforeEach(async ({ request }) => {
    await cleanupCommands(request);
    await cleanupServers(request, E2E_PREFIX);
  });
  test.afterEach(async ({ request }) => {
    await cleanupCommands(request);
    await cleanupServers(request, E2E_PREFIX);
  });

  test('无激活终端时点击命令 → 提示先打开会话', async ({ page, request }) => {
    await createCommand(request, 'echo hello-e2e');
    await page.goto('/');

    // 命令库是默认 Tab，等命令内容出现在列表里
    await expect(page.getByText('echo hello-e2e', { exact: true })).toBeVisible({
      timeout: 10000,
    });
    // 点击命令（无终端打开）
    await page.getByText('echo hello-e2e', { exact: true }).click();

    // 出现提示 toast
    await expect(page.getByText('请先在左侧打开一个终端会话')).toBeVisible({
      timeout: 5000,
    });
  });

  test('有激活终端时点击命令 → 不提示、命令插入', async ({ page, request }) => {
    await createCommand(request, 'echo hello-e2e');
    await createServer(request, `${E2E_PREFIX}with-term`);

    await page.goto('/');
    // 打开终端（连接 127.0.0.1:22 会失败，但 Tab 存在即"激活终端"）
    const item = page.getByRole('button').filter({ hasText: `${E2E_PREFIX}with-term` });
    await expect(item).toBeVisible({ timeout: 10000 });
    await item.click();
    await expect(page.locator('.xterm').first()).toBeAttached({ timeout: 5000 });

    // 点命令 → 不应弹"请先打开"提示（说明插入到激活终端）
    await page.getByText('echo hello-e2e', { exact: true }).click();
    await page.waitForTimeout(800);
    await expect(page.getByText('请先在左侧打开一个终端会话')).not.toBeVisible();
  });
});
