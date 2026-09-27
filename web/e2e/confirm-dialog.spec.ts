/**
 * UI 回归：确认对话框（ConfirmDialog）——点击"确认"后必须关闭。
 *
 * 背景：ConfirmDialog 曾在确认按钮上调用 e.preventDefault()，而 Radix 的
 * AlertDialog.Action 依赖默认行为关闭弹窗，导致确认后对话框停留在屏幕上
 * （只有"取消"能关）。此用例锁住该行为，覆盖"清空全部历史"与"删除单条"两条路径。
 *
 * 前置：本项目 E2E 应运行在开发数据目录上（./script/run.sh --dev），
 * 用例会清空该目录的历史数据，不触碰正式数据。
 */
import { test, expect, type APIRequestContext } from '@playwright/test';
import { BACKEND, E2E_PREFIX } from './helpers';

const CMD = `${E2E_PREFIX}history-dialog`;

async function resetHistory(request: APIRequestContext, commands: string[] = []) {
  await request.delete(`${BACKEND}/api/history`);
  for (const command of commands) {
    const res = await request.post(`${BACKEND}/api/history`, {
      data: { server_id: 'e2e-srv', server_name: 'E2E-DIALOG', username: 'e2e', command },
    });
    if (!res.ok()) throw new Error(`建历史失败 ${res.status()}: ${await res.text()}`);
  }
}

/** 打开右栏"历史"Tab，并等待指定命令出现 */
async function openHistory(page: import('@playwright/test').Page, command: string) {
  await page.goto('/');
  await page.getByRole('tab', { name: '历史' }).click();
  await expect(page.getByText(command, { exact: true })).toBeVisible({ timeout: 10000 });
}

test.describe('确认对话框：确认后关闭', () => {
  test.beforeEach(async ({ request }) => {
    await resetHistory(request, [`${CMD}-one`, `${CMD}-two`]);
  });

  test.afterEach(async ({ request }) => {
    await resetHistory(request);
  });

  test('清空全部历史：确认后弹窗关闭且列表清空', async ({ page }) => {
    await openHistory(page, `${CMD}-one`);

    await page.getByTitle('清空全部历史').click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();

    await dialog.getByRole('button', { name: '清空' }).click();

    // 核心断言：确认后对话框消失（曾经的 bug 是停留不关）
    await expect(dialog).not.toBeVisible({ timeout: 5000 });
    await expect(page.getByText('还没有历史命令')).toBeVisible({ timeout: 5000 });
  });

  test('删除单条历史：确认后弹窗关闭且该条消失', async ({ page }) => {
    const target = `${CMD}-two`;
    await openHistory(page, target);

    // 删除按钮默认 opacity-0，hover 行后才显示
    const row = page.locator('.group').filter({ hasText: target });
    await row.hover();
    await row.getByTitle('删除').click();

    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();

    await dialog.getByRole('button', { name: '删除' }).click();

    await expect(dialog).not.toBeVisible({ timeout: 5000 });
    await expect(page.getByText(target, { exact: true })).not.toBeVisible();
  });
});
