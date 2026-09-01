/**
 * 终端显示设置：字体大小 / 字体 / 配色方案。
 * 持久化到 localStorage，全局生效（所有终端 Tab 共享）。
 */
import type { ITheme } from '@xterm/xterm';

/** 配色方案定义 */
export interface ThemePreset {
  id: string;
  label: string;
  /** 供 UI 预览的色块（背景/前景） */
  previewBg: string;
  previewFg: string;
  theme: ITheme;
}

/** 终端显示设置 */
export interface TerminalSettings {
  /** 字体大小（px） */
  fontSize: number;
  /** 字体族（CSS font-family 值） */
  fontFamily: string;
  /** 配色方案 id */
  themeId: string;
}

export const FONT_SIZE_MIN = 10;
export const FONT_SIZE_MAX = 20;
export const FONT_SIZE_STEP = 1;

/** 常用等宽字体（CSS font-family） */
export const FONT_OPTIONS: { label: string; value: string }[] = [
  {
    label: '系统默认 (Menlo/Monaco/Consolas)',
    value: 'Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  },
  { label: 'JetBrains Mono', value: '"JetBrains Mono", Menlo, monospace' },
  { label: 'Fira Code', value: '"Fira Code", Menlo, monospace' },
  { label: 'Cascadia Code', value: '"Cascadia Code", Consolas, monospace' },
  { label: 'Source Code Pro', value: '"Source Code Pro", Menlo, monospace' },
  { label: 'Consolas', value: 'Consolas, Menlo, monospace' },
  { label: 'Courier New', value: '"Courier New", monospace' },
];

/** 配色方案（与整体 UI 协调的 ANSI 色板） */
export const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'zinc-dark',
    label: '暗色 (默认)',
    previewBg: '#09090b',
    previewFg: '#e4e4e7',
    theme: {
      background: '#09090b',
      foreground: '#e4e4e7',
      cursor: '#e4e4e7',
      cursorAccent: '#09090b',
      selectionBackground: '#3f3f46',
      black: '#18181b',
      red: '#f87171',
      green: '#4ade80',
      yellow: '#facc15',
      blue: '#60a5fa',
      magenta: '#e879f9',
      cyan: '#22d3ee',
      white: '#d4d4d8',
      brightBlack: '#3f3f46',
      brightRed: '#fca5a5',
      brightGreen: '#86efac',
      brightYellow: '#fde047',
      brightBlue: '#93c5fd',
      brightMagenta: '#f0abfc',
      brightCyan: '#67e8f9',
      brightWhite: '#fafafa',
    },
  },
  {
    id: 'light',
    label: '亮色',
    previewBg: '#fafafa',
    previewFg: '#18181b',
    theme: {
      background: '#fafafa',
      foreground: '#18181b',
      cursor: '#18181b',
      cursorAccent: '#fafafa',
      selectionBackground: '#d4d4d8',
      black: '#27272a',
      red: '#dc2626',
      green: '#16a34a',
      yellow: '#ca8a04',
      blue: '#2563eb',
      magenta: '#c026d3',
      cyan: '#0891b2',
      white: '#52525b',
      brightBlack: '#71717a',
      brightRed: '#ef4444',
      brightGreen: '#22c55e',
      brightYellow: '#eab308',
      brightBlue: '#3b82f6',
      brightMagenta: '#d946ef',
      brightCyan: '#06b6d4',
      brightWhite: '#18181b',
    },
  },
  {
    id: 'crt-green',
    label: '绿色 CRT',
    previewBg: '#0a0f0a',
    previewFg: '#33ff66',
    theme: {
      background: '#0a0f0a',
      foreground: '#33ff66',
      cursor: '#33ff66',
      cursorAccent: '#0a0f0a',
      selectionBackground: '#1f3d2b',
      black: '#0d1a0d',
      red: '#ff5555',
      green: '#33ff66',
      yellow: '#ffee55',
      blue: '#55aaff',
      magenta: '#ff77ff',
      cyan: '#55ffff',
      white: '#ccffcc',
      brightBlack: '#446644',
      brightRed: '#ff8888',
      brightGreen: '#66ff88',
      brightYellow: '#ffff88',
      brightBlue: '#88ccff',
      brightMagenta: '#ff99ff',
      brightCyan: '#88ffff',
      brightWhite: '#ffffff',
    },
  },
];

const STORAGE_KEY = 'ws-terminal-settings';

export const DEFAULT_SETTINGS: TerminalSettings = {
  fontSize: 13,
  fontFamily: FONT_OPTIONS[0].value,
  themeId: 'zinc-dark',
};

/** 读取设置（解析失败或字段缺失时回退默认值） */
export function loadSettings(): TerminalSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<TerminalSettings>;
    return {
      fontSize:
        typeof parsed.fontSize === 'number' &&
        parsed.fontSize >= FONT_SIZE_MIN &&
        parsed.fontSize <= FONT_SIZE_MAX
          ? parsed.fontSize
          : DEFAULT_SETTINGS.fontSize,
      fontFamily:
        typeof parsed.fontFamily === 'string' && parsed.fontFamily
          ? parsed.fontFamily
          : DEFAULT_SETTINGS.fontFamily,
      themeId:
        typeof parsed.themeId === 'string' &&
        THEME_PRESETS.some((t) => t.id === parsed.themeId)
          ? parsed.themeId
          : DEFAULT_SETTINGS.themeId,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/** 保存设置 */
export function saveSettings(settings: TerminalSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // localStorage 不可用（隐私模式等）时静默失败
  }
}

/** 按 id 取配色方案 */
export function getThemeById(id: string): ThemePreset {
  return THEME_PRESETS.find((t) => t.id === id) ?? THEME_PRESETS[0];
}
