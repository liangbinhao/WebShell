import { Minus, Plus } from 'lucide-react';
import {
  FONT_OPTIONS,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  FONT_SIZE_STEP,
  TERMINAL_THEMES,
  UI_THEMES,
  UI_ZOOM_MAX,
  UI_ZOOM_MIN,
  UI_ZOOM_STEP,
  type AppearanceSettings,
} from '../lib/appearance';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { cn } from '@/lib/utils';

interface SettingsPanelProps {
  appearance: AppearanceSettings;
  onChange: (next: AppearanceSettings) => void;
}

/** 右栏「设置」Tab：界面外观（主题/缩放）+ 终端显示（字号/字体/配色） */
export function SettingsPanel({ appearance, onChange }: SettingsPanelProps) {
  const patchUi = (patch: Partial<AppearanceSettings>) =>
    onChange({ ...appearance, ...patch });
  const patchTerminal = (patch: Partial<AppearanceSettings['terminal']>) =>
    onChange({ ...appearance, terminal: { ...appearance.terminal, ...patch } });

  const zoomPct = Math.round(appearance.uiZoom * 100);

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto p-4 text-sm">
      {/* ---------- 界面外观 ---------- */}
      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          界面外观
        </h3>

        {/* UI 主题 */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">界面主题</Label>
          <div className="grid grid-cols-3 gap-2">
            {UI_THEMES.map((t) => (
              <button
                key={t.id}
                onClick={() => patchUi({ uiThemeId: t.id })}
                className={cn(
                  'flex flex-col items-center gap-1.5 rounded-md border p-2 transition-colors',
                  appearance.uiThemeId === t.id
                    ? 'border-foreground/60 bg-accent'
                    : 'border-border bg-background hover:border-foreground/40',
                )}
                title={t.label}
              >
                <span
                  className="block h-9 w-full rounded-sm border border-black/20"
                  style={{ background: t.previewBg }}
                >
                  <span
                    className="block h-full w-full rounded-sm px-1 pt-1 font-mono text-[10px] leading-none"
                    style={{ color: t.previewFg }}
                  >
                    Aa
                  </span>
                </span>
                <span
                  className={cn(
                    'text-[11px]',
                    appearance.uiThemeId === t.id
                      ? 'text-foreground'
                      : 'text-muted-foreground',
                  )}
                >
                  {t.label}
                </span>
              </button>
            ))}
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            终端配色默认跟随界面主题（可在下方单独覆盖）
          </p>
        </div>

        {/* UI 缩放（整体等比，类似 DPI） */}
        <div className="space-y-2 pt-1">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">界面缩放</Label>
            <span className="font-mono text-xs text-foreground">{zoomPct}%</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              disabled={appearance.uiZoom <= UI_ZOOM_MIN}
              onClick={() =>
                patchUi({
                  uiZoom: Math.max(
                    UI_ZOOM_MIN,
                    Math.round((appearance.uiZoom - UI_ZOOM_STEP) * 100) / 100,
                  ),
                })
              }
              title="缩小界面"
            >
              <Minus className="h-3.5 w-3.5" />
            </Button>
            <input
              type="range"
              min={UI_ZOOM_MIN}
              max={UI_ZOOM_MAX}
              step={UI_ZOOM_STEP}
              value={appearance.uiZoom}
              onChange={(e) => patchUi({ uiZoom: Number(e.target.value) })}
              className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-border accent-current"
              aria-label="界面缩放"
            />
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              disabled={appearance.uiZoom >= UI_ZOOM_MAX}
              onClick={() =>
                patchUi({
                  uiZoom: Math.min(
                    UI_ZOOM_MAX,
                    Math.round((appearance.uiZoom + UI_ZOOM_STEP) * 100) / 100,
                  ),
                })
              }
              title="放大界面"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            整体等比缩放界面（文字与间距一起），终端字号单独控制
          </p>
        </div>
      </section>

      {/* ---------- 终端显示 ---------- */}
      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          终端显示
        </h3>

        {/* 终端字号 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">终端字号</Label>
            <span className="font-mono text-xs text-foreground">
              {appearance.terminal.fontSize}px
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              disabled={appearance.terminal.fontSize <= FONT_SIZE_MIN}
              onClick={() =>
                patchTerminal({
                  fontSize: Math.max(
                    FONT_SIZE_MIN,
                    appearance.terminal.fontSize - FONT_SIZE_STEP,
                  ),
                })
              }
              title="减小终端字号"
            >
              <Minus className="h-3.5 w-3.5" />
            </Button>
            <input
              type="range"
              min={FONT_SIZE_MIN}
              max={FONT_SIZE_MAX}
              step={FONT_SIZE_STEP}
              value={appearance.terminal.fontSize}
              onChange={(e) => patchTerminal({ fontSize: Number(e.target.value) })}
              className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-border accent-current"
              aria-label="终端字号"
            />
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              disabled={appearance.terminal.fontSize >= FONT_SIZE_MAX}
              onClick={() =>
                patchTerminal({
                  fontSize: Math.min(
                    FONT_SIZE_MAX,
                    appearance.terminal.fontSize + FONT_SIZE_STEP,
                  ),
                })
              }
              title="增大终端字号"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* 终端字体 */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">终端字体</Label>
          <select
            value={appearance.terminal.fontFamily}
            onChange={(e) => patchTerminal({ fontFamily: e.target.value })}
            className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs text-foreground outline-none focus:border-foreground/50"
            aria-label="终端字体"
          >
            {FONT_OPTIONS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </div>

        {/* 终端配色（auto = 跟随界面主题） */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">终端配色</Label>
          <div className="grid grid-cols-2 gap-2">
            {/* 跟随界面 */}
            <button
              onClick={() => patchTerminal({ themeId: 'auto' })}
              className={cn(
                'flex flex-col items-center gap-1.5 rounded-md border p-2 transition-colors',
                appearance.terminal.themeId === 'auto'
                  ? 'border-foreground/60 bg-accent'
                  : 'border-border bg-background hover:border-foreground/40',
              )}
              title="跟随界面主题"
            >
              <span className="flex h-9 w-full items-center justify-center rounded-sm border border-black/20 bg-background text-[11px] text-foreground">
                跟随界面
              </span>
            </button>
            {TERMINAL_THEMES.map((t) => (
              <button
                key={t.id}
                onClick={() => patchTerminal({ themeId: t.id })}
                className={cn(
                  'flex flex-col items-center gap-1.5 rounded-md border p-2 transition-colors',
                  appearance.terminal.themeId === t.id
                    ? 'border-foreground/60 bg-accent'
                    : 'border-border bg-background hover:border-foreground/40',
                )}
                title={t.label}
              >
                <span
                  className="block h-9 w-full rounded-sm border border-black/20"
                  style={{ background: t.previewBg }}
                >
                  <span
                    className="block h-full w-full rounded-sm px-1 pt-1 font-mono text-[10px] leading-none"
                    style={{ color: t.previewFg }}
                  >
                    $ _
                  </span>
                </span>
                <span className="text-[11px] text-muted-foreground">{t.label}</span>
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
