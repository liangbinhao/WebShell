import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * Web SSH Workspace E2E 配置（核心旅程，见 docs/agent/testing-policy.md）。
 *
 * 前置：后端与前端需已启动（项目根目录 ./script/run.sh）。
 * - 前端 http://127.0.0.1:5173（vite，/api 与 /ws 代理到 8000）
 * - 后端 http://127.0.0.1:8000
 *
 * 运行：cd web && npx playwright test
 * （浏览器装到项目本地 .pw-browsers，避免写系统缓存目录）
 */
process.env.PLAYWRIGHT_BROWSERS_PATH ||= path.join(path.dirname(fileURLToPath(import.meta.url)), '.pw-browsers');

export default defineConfig({
  testDir: './e2e',
  // E2E 少而精：核心旅程，串行执行避免相互干扰
  fullyParallel: false,
  workers: 1,
  // 失败重试一次 + 失败时保留 trace（Playwright Best Practices：CI 调试用 trace）
  retries: 1,
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // 后端真实 API 入口（供测试内建/清理数据用）
    // 注意：E2E 走浏览器页面，REST 数据准备通过 request 上下文
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
  reporter: [['list']],
});
