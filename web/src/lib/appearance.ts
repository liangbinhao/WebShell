/**
 * 外观系统：UI 主题 + UI 缩放 + 终端显示（字号/字体/配色）。
 *
 * 设计为可扩展（个人工作台方向）：任何功能组件都可读同一份外观设置，
 * 新增 UI 主题 = 在 UI_THEMES 加一项（CSS class 定义在 index.css）。
 * 持久化到 localStorage（key: ws-appearance），并兼容读取旧版
 * ws-terminal-settings（迁移到新结构）。
 */
import type { ITheme } from '@xterm/xterm';

/* ---------------------------------------------------------------- 终端配色 */

/** 终端配色预设（ITheme 即 xterm ANSI 色板） */
export interface TerminalThemePreset {
  id: string;
  label: string;
  /** UI 预览色 */
  previewBg: string;
  previewFg: string;
  theme: ITheme;
}

export const TERMINAL_THEMES: TerminalThemePreset[] = [
  {
    id: 'zinc-dark',
    label: '暗色 (默认)',
    previewBg: '#09090b',
    previewFg: '#e4e4e7',
    theme: {
      background: '#09090b', foreground: '#e4e4e7', cursor: '#e4e4e7',
      cursorAccent: '#09090b', selectionBackground: '#3f3f46',
      black: '#18181b', red: '#f87171', green: '#4ade80', yellow: '#facc15',
      blue: '#60a5fa', magenta: '#e879f9', cyan: '#22d3ee', white: '#d4d4d8',
      brightBlack: '#3f3f46', brightRed: '#fca5a5', brightGreen: '#86efac',
      brightYellow: '#fde047', brightBlue: '#93c5fd', brightMagenta: '#f0abfc',
      brightCyan: '#67e8f9', brightWhite: '#fafafa',
    },
  },
  {
    id: 'light',
    label: '亮色',
    previewBg: '#fafafa',
    previewFg: '#18181b',
    theme: {
      background: '#fafafa', foreground: '#18181b', cursor: '#18181b',
      cursorAccent: '#fafafa', selectionBackground: '#d4d4d8',
      black: '#27272a', red: '#dc2626', green: '#16a34a', yellow: '#ca8a04',
      blue: '#2563eb', magenta: '#c026d3', cyan: '#0891b2', white: '#52525b',
      brightBlack: '#71717a', brightRed: '#ef4444', brightGreen: '#22c55e',
      brightYellow: '#eab308', brightBlue: '#3b82f6', brightMagenta: '#d946ef',
      brightCyan: '#06b6d4', brightWhite: '#18181b',
    },
  },
  {
    id: 'crt-green',
    label: '绿色 CRT',
    previewBg: '#0a0f0a',
    previewFg: '#33ff66',
    theme: {
      background: '#0a0f0a', foreground: '#33ff66', cursor: '#33ff66',
      cursorAccent: '#0a0f0a', selectionBackground: '#1f3d2b',
      black: '#0d1a0d', red: '#ff5555', green: '#33ff66', yellow: '#ffee55',
      blue: '#55aaff', magenta: '#ff77ff', cyan: '#55ffff', white: '#ccffcc',
      brightBlack: '#446644', brightRed: '#ff8888', brightGreen: '#66ff88',
      brightYellow: '#ffff88', brightBlue: '#88ccff', brightMagenta: '#ff99ff',
      brightCyan: '#88ffff', brightWhite: '#ffffff',
    },
  },
];

/* ---------------------------------------------------------------- UI 主题 */

/**
 * UI 主题：CSS class 应用在 <html> 上（index.css 定义同名变量组）。
 * terminalThemeId：该 UI 主题默认关联的终端配色（终端可选 auto 跟随）。
 */
export interface UiThemeDef {
  id: string;
  label: string;
  /** 对应 index.css 里的 class（如 theme-zinc-dark） */
  className: string;
  /** 关联的终端配色 id */
  terminalThemeId: string;
  previewBg: string;
  previewFg: string;
}

export const UI_THEMES: UiThemeDef[] = [
  {
    id: 'zinc-dark', label: '暗色 zinc',
    className: 'theme-zinc-dark', terminalThemeId: 'zinc-dark',
    previewBg: '#09090b', previewFg: '#e4e4e7',
  },
  {
    id: 'light', label: '亮色',
    className: 'theme-light', terminalThemeId: 'light',
    previewBg: '#fafafa', previewFg: '#18181b',
  },
  {
    id: 'crt', label: '绿色 CRT',
    className: 'theme-crt', terminalThemeId: 'crt-green',
    previewBg: '#0a0f0a', previewFg: '#33ff66',
  },
];

/* ---------------------------------------------------------------- 字体 */

export const FONT_SIZE_MIN = 10;
export const FONT_SIZE_MAX = 20;
export const FONT_SIZE_STEP = 1;

export const FONT_OPTIONS: { label: string; value: string }[] = [
  { label: '系统默认 (Menlo/Monaco/Consolas)', value: 'Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace' },
  { label: 'JetBrains Mono', value: '"JetBrains Mono", Menlo, monospace' },
  { label: 'Fira Code', value: '"Fira Code", Menlo, monospace' },
  { label: 'Cascadia Code', value: '"Cascadia Code", Consolas, monospace' },
  { label: 'Source Code Pro', value: '"Source Code Pro", Menlo, monospace' },
  { label: 'Consolas', value: 'Consolas, Menlo, monospace' },
  { label: 'Courier New', value: '"Courier New", monospace' },
];

/* ---------------------------------------------------------------- 外观设置 */

/** UI 缩放档位（整体等比，类似 DPI；1.0 = 100%） */
export const UI_ZOOM_MIN = 0.85;
export const UI_ZOOM_MAX = 1.3;
export const UI_ZOOM_STEP = 0.05;

export interface AppearanceSettings {
  /** UI 主题 id（UI_THEMES） */
  uiThemeId: string;
  /** UI 整体缩放（0.85 ~ 1.3） */
  uiZoom: number;
  terminal: {
    /** 终端字号（px，独立于 UI 缩放） */
    fontSize: number;
    /** 终端字体族 */
    fontFamily: string;
    /** 终端配色：'auto' = 跟随 UI 主题；否则为 TERMINAL_THEMES id */
    themeId: string;
  };
}

const STORAGE_KEY = 'ws-appearance';
const LEGACY_KEY = 'ws-terminal-settings';

export const DEFAULT_APPEARANCE: AppearanceSettings = {
  uiThemeId: 'zinc-dark',
  uiZoom: 1,
  terminal: {
    fontSize: 13,
    fontFamily: FONT_OPTIONS[0].value,
    themeId: 'auto',
  },
};

/* ---------------------------------------------------------------- 工具函数 */

export function getUiTheme(id: string): UiThemeDef {
  return UI_THEMES.find((t) => t.id === id) ?? UI_THEMES[0];
}

export function getTerminalTheme(id: string): TerminalThemePreset {
  return TERMINAL_THEMES.find((t) => t.id === id) ?? TERMINAL_THEMES[0];
}

/** 解析终端实际配色：auto → UI 主题关联色，否则指定预设 */
export function resolveTerminalThemeId(app: AppearanceSettings): string {
  if (app.terminal.themeId === 'auto') {
    return getUiTheme(app.uiThemeId).terminalThemeId;
  }
  return app.terminal.themeId;
}

function clampZoom(v: number): number {
  if (!Number.isFinite(v)) return DEFAULT_APPEARANCE.uiZoom;
  return Math.min(UI_ZOOM_MAX, Math.max(UI_ZOOM_MIN, v));
}

/** 读取外观设置（解析失败/字段缺失回退默认；兼容旧 ws-terminal-settings） */
export function loadAppearance(): AppearanceSettings {
  try {
    // 优先新 key
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<AppearanceSettings>;
      const uiThemeId =
        typeof p.uiThemeId === 'string' && UI_THEMES.some((t) => t.id === p.uiThemeId)
          ? p.uiThemeId
          : DEFAULT_APPEARANCE.uiThemeId;
      const uiZoom = clampZoom(p.uiZoom ?? DEFAULT_APPEARANCE.uiZoom);
      const term: AppearanceSettings['terminal'] = {
        ...DEFAULT_APPEARANCE.terminal,
        ...(p.terminal ?? {}),
      };
      return {
        uiThemeId,
        uiZoom,
        terminal: {
          fontSize:
            typeof term.fontSize === 'number' &&
            term.fontSize >= FONT_SIZE_MIN &&
            term.fontSize <= FONT_SIZE_MAX
              ? term.fontSize
              : DEFAULT_APPEARANCE.terminal.fontSize,
          fontFamily:
            typeof term.fontFamily === 'string' && term.fontFamily
              ? term.fontFamily
              : DEFAULT_APPEARANCE.terminal.fontFamily,
          themeId:
            term.themeId === 'auto' ||
            (typeof term.themeId === 'string' &&
              TERMINAL_THEMES.some((t) => t.id === term.themeId))
              ? term.themeId ?? 'auto'
              : 'auto',
        },
      };
    }
    // 兼容旧版 ws-terminal-settings → 迁移（旧 themeId 直接对应同 id 终端主题）
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const p = JSON.parse(legacy) as { fontSize?: number; fontFamily?: string; themeId?: string };
      const themeId =
        typeof p.themeId === 'string' && TERMINAL_THEMES.some((t) => t.id === p.themeId)
          ? p.themeId
          : 'auto';
      return {
        uiThemeId: DEFAULT_APPEARANCE.uiThemeId,
        uiZoom: 1,
        terminal: {
          fontSize:
            typeof p.fontSize === 'number' &&
            p.fontSize >= FONT_SIZE_MIN && p.fontSize <= FONT_SIZE_MAX
              ? p.fontSize
              : 13,
          fontFamily:
            typeof p.fontFamily === 'string' && p.fontFamily
              ? p.fontFamily
              : FONT_OPTIONS[0].value,
          // 旧设置里明确选了配色 → 保持独立选择；没选过则 auto
          themeId,
        },
      };
    }
    return DEFAULT_APPEARANCE;
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

/** 保存外观设置（并清理旧 key） */
export function saveAppearance(app: AppearanceSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(app));
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    // localStorage 不可用（隐私模式等）时静默失败
  }
}

/** 把外观设置应用到 DOM：html class（主题）+ zoom（整体缩放） */
export function applyAppearanceToDom(app: AppearanceSettings): void {
  const root = document.documentElement;
  // 主题：移除旧主题 class，加当前
  for (const t of UI_THEMES) root.classList.remove(t.className);
  root.classList.add(getUiTheme(app.uiThemeId).className);
  // 缩放：CSS zoom（现代浏览器支持；影响布局与文字，整体等比）
  root.style.zoom = String(clampZoom(app.uiZoom));
}
