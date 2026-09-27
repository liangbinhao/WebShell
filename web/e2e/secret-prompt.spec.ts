import { expect, test } from '@playwright/test';
import { isSecretPrompt } from '../src/lib/secretPrompt';

/**
 * 纯逻辑单测：密码提示识别（不需要浏览器与后端）。
 *
 * 背景（安全问题）：su / sudo / passwd / mysql -p 等密码提示下远端关闭回显，
 * 屏幕上没有密码，但前端输入缓冲仍会累积按键，Enter 时会被当成"命令"写入历史。
 * 这些用例锁定 isSecretPrompt 的判定边界。
 */

const POSITIVES = [
  'Password: ',
  'Password:',
  '[sudo] password for lbh: ',
  "root@192.168.1.1's password: ",
  "Enter passphrase for key '/home/u/.ssh/id_rsa': ",
  '(current) UNIX password: ',
  'New password: ',
  'Retype new password: ',
  'Enter password: ',
  'PIN: ',
  '密码：',
  '请输入密码：',
  '口令: ',
];

const NEGATIVES = [
  '',
  '   ',
  'ls -la',
  'lbh@mac:~$ echo Password:',
  'grep -r password: .',
  'mysql -u root -p',
  'git commit -m "fix password: leak"',
  'lbh@mac:~$ echo "密码："',
];

test.describe('密码提示识别 isSecretPrompt', () => {
  for (const line of POSITIVES) {
    test(`识别密码提示：${JSON.stringify(line)}`, () => {
      expect(isSecretPrompt(line)).toBe(true);
    });
  }

  for (const line of NEGATIVES) {
    test(`不误判普通行：${JSON.stringify(line)}`, () => {
      expect(isSecretPrompt(line)).toBe(false);
    });
  }
});
