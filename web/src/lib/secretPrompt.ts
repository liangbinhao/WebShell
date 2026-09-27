/**
 * 密码类提示识别（纯逻辑，便于单测）。
 *
 * 为什么需要：命令历史依赖本地输入缓冲累积按键，而 `su` / `sudo` / `passwd` /
 * `mysql -p` / ssh 密钥口令等场景下远端会关闭回显——屏幕上没有密码，但本地缓冲
 * 仍会累积用户输入的每个字符，Enter 时就被当成"命令"写入历史（安全问题）。
 * 识别到密码提示时，调用方必须跳过记录并清空缓冲。
 */

/** 主机/用户前缀：`root@host's ` / `user@192.168.1.1 ` 等 */
const HOST_PREFIX = String.raw`(?:[\w.-]+@[\w.-]+'?s?\s+)?`;
/** 英文提示前缀：`[sudo] ` / `Enter ` / `current ` / `new ` / `retype new ` / `unix ` */
const EN_PREFIX = String.raw`(?:\[sudo\]\s*)?${HOST_PREFIX}(?:enter\s+)?(?:current\s+|new\s+|retype\s+new\s+|repeat\s+new\s+|unix\s+)*`;

const PATTERNS: RegExp[] = [
  // Password: / [sudo] password for lbh: / root@host's password: / New password:
  new RegExp(String.raw`^${EN_PREFIX}password(?:[^:：]*)?[:：]\s*\S*$`, 'i'),
  // Enter passphrase for key '/home/u/.ssh/id_rsa':
  new RegExp(String.raw`^${EN_PREFIX}passphrase(?:[^:：]*)?[:：]\s*\S*$`, 'i'),
  // passwd: / PIN: / passcode: / Verification code:
  new RegExp(
    String.raw`^${EN_PREFIX}(?:passwd|pin|passcode|verification\s+code)(?:[^:：]*)?[:：]\s*\S*$`,
    'i',
  ),
  // (current) UNIX password:
  /^\(current\)\s+unix\s+password[:：]\s*\S*$/i,
  // 中文：密码：/ 口令：/ 请输入密码：/ 输入密码：
  /^(?:[\w.-]+@[\w.-]+'?s?\s+)?(?:请输入|输入)?(?:密码|口令)(?:[^:：]*)?[:：]\s*\S*$/,
];

/**
 * 判断终端光标所在行是否为密码类提示。
 *
 * 传入终端当前行的文本（不含换行）。带 shell 提示符前缀的命令行（如
 * `lbh@mac:~$ echo Password:`）不会被误判——因此类文本不满足行首锚定。
 */
export function isSecretPrompt(line: string): boolean {
  const text = line.replace(/\s+$/, '');
  if (!text) return false;
  return PATTERNS.some((re) => re.test(text));
}
