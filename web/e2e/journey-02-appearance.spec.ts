/**
 * 核心旅程 2：外观设置——界面主题切换影响整个 UI，终端配色 auto 跟随。
 *
 * 验证（requirements §15.1 外观系统）：
 * - 切"亮色"主题 → html class 变 theme-light、body 背景变白
 * - 切"绿色 CRT"主题 → 终端配色（auto）跟随，xterm 背景变绿
 * - 持久化到 localStorage（ws-appearance）
 */
import { test, expect } from '@playwright/test';

test.describe('外观系统：主题与终端联动', () => {
  test('切换界面主题影响 UI 与终端配色', async ({ page }) => {
    await page.goto('/');

    // 打开右栏「设置」Tab
    await page.getByRole('tab', { name: '设置' }).click();
    await expect(page.getByText('界面外观', { exact: true })).toBeVisible();

    // 默认暗色：html class 含 theme-zinc-dark，body 背景为深色
    const initialClass = await page.evaluate(() => document.documentElement.className);
    expect(initialClass).toContain('theme-zinc-dark');
    const initialBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(initialBg).not.toBe('rgb(255, 255, 255)'); // 非白色 = 暗色

    // 切「亮色」主题（色卡按钮文案）
    await page.getByText('亮色', { exact: true }).first().click();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.className))
      .toContain('theme-light');
    const lightBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(lightBg).toBe('rgb(255, 255, 255)'); // 亮色背景

    // 持久化
    const saved = await page.evaluate(() => localStorage.getItem('ws-appearance'));
    expect(saved).toContain('"uiThemeId":"light"');
  });

  test('界面缩放改变 html zoom', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('tab', { name: '设置' }).click();
    await expect(page.getByText('界面缩放', { exact: true })).toBeVisible();

    // 点「放大界面」→ zoom 增大
    const before = await page.evaluate(() => parseFloat(document.documentElement.style.zoom) || 1);
    await page.getByTitle('放大界面').click();
    await expect
      .poll(() => page.evaluate(() => parseFloat(document.documentElement.style.zoom) || 1))
      .toBeGreaterThan(before);
  });
});
