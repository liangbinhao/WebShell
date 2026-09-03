/**
 * 核心旅程 1：添加服务器 → 打开终端 → 连接状态机。
 *
 * 场景：指向 127.0.0.1:22（本机一般无 sshd）——连接流程应结束：
 * connecting → error（Failed to connect...）→ disconnected（WS 关闭后稳定态）。
 * 验证终端 UI 完整渲染 + 状态驱动正确（requirements §6.1 / CONTRACT §4）。
 *
 * 注：本机若真起了 sshd 则可能 connected，故对"结束态"做宽松断言
 * （非 connecting 即流程已走完），核心验证 Failed to connect 错误信息出现。
 */
import { test, expect } from '@playwright/test';
import { cleanupServers, createServer, E2E_PREFIX } from './helpers';

test.describe('服务器 → 终端连接状态机', () => {
  const NAME = `${E2E_PREFIX}terminal-state`;

  test.beforeEach(async ({ request }) => {
    await cleanupServers(request, E2E_PREFIX);
    await createServer(request, NAME);
  });

  test.afterEach(async ({ request }) => {
    await cleanupServers(request, E2E_PREFIX);
  });

  test('点击服务器打开终端，出现连接错误提示且状态结束 Connecting', async ({ page }) => {
    // 打开页面，等服务器列表加载
    await page.goto('/');
    const serverItem = page.getByRole('button').filter({ hasText: NAME });
    await expect(serverItem).toBeVisible({ timeout: 10000 });

    // 点击服务器 → 打开终端 Tab
    await serverItem.click();

    // 终端 Tab 出现 + xterm 渲染
    await expect(page.getByText(NAME).first()).toBeVisible();
    await expect(page.locator('.xterm').first()).toBeAttached({ timeout: 5000 });

    // 终端内容出现连接失败错误（CONTRACT §4 error 消息 → 红色渲染）
    // 127.0.0.1:22 无 sshd → Failed to connect
    await expect(page.locator('.xterm').first()).toContainText(/Failed to connect/i, {
      timeout: 15000,
    });

    // 状态条不再显示 Connecting（连接流程已结束；终态可能是 Error 或 Disconnected）
    await expect(page.getByText('Connecting', { exact: true })).not.toBeVisible({
      timeout: 8000,
    });
    // 终态显示 Disconnected 或 Error 之一（快照显示断开后为 Disconnected）
    const hasEndState = page
      .locator('text=Disconnected')
      .or(page.locator('text=Error'))
      .first();
    await expect(hasEndState).toBeVisible({ timeout: 8000 });
  });
});
