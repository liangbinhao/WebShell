import { Minus, Plus } from 'lucide-react';
import {
  FONT_OPTIONS,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  FONT_SIZE_STEP,
  THEME_PRESETS,
  type TerminalSettings,
} from '../lib/terminal-settings';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { cn } from '@/lib/utils';

interface SettingsPanelProps {
  settings: TerminalSettings;
  onChange: (next: TerminalSettings) => void;
}

/** 右栏「设置」Tab：终端字体大小 / 字体 / 配色方案（全局生效） */
export function SettingsPanel({ settings, onChange }: SettingsPanelProps) {
  const set = (patch: Partial<TerminalSettings>) =>
    onChange({ ...settings, ...patch });

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto p-4 text-sm">
      {/* 字体大小 */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">字体大小</Label>
          <span className="font-mono text-xs text-foreground">
            {settings.fontSize}px
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7"
            disabled={settings.fontSize <= FONT_SIZE_MIN}
            onClick={() =>
              set({
                fontSize: Math.max(
                  FONT_SIZE_MIN,
                  settings.fontSize - FONT_SIZE_STEP,
                ),
              })
            }
            title="减小字号"
          >
            <Minus className="h-3.5 w-3.5" />
          </Button>
          <input
            type="range"
            min={FONT_SIZE_MIN}
            max={FONT_SIZE_MAX}
            step={FONT_SIZE_STEP}
            value={settings.fontSize}
            onChange={(e) => set({ fontSize: Number(e.target.value) })}
            className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-zinc-700 accent-zinc-200"
            aria-label="字体大小"
          />
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7"
            disabled={settings.fontSize >= FONT_SIZE_MAX}
            onClick={() =>
              set({
                fontSize: Math.min(
                  FONT_SIZE_MAX,
                  settings.fontSize + FONT_SIZE_STEP,
                ),
              })
            }
            title="增大字号"
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </section>

      {/* 字体 */}
      <section className="space-y-2">
        <Label className="text-xs text-muted-foreground">字体</Label>
        <select
          value={settings.fontFamily}
          onChange={(e) => set({ fontFamily: e.target.value })}
          className="h-8 w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 text-xs text-foreground outline-none focus:border-zinc-500"
          aria-label="终端字体"
        >
          {FONT_OPTIONS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          终端需要等宽字体以获得最佳效果；未安装的字体将回退到系统默认。
        </p>
      </section>

      {/* 配色方案 */}
      <section className="space-y-2">
        <Label className="text-xs text-muted-foreground">配色方案</Label>
        <div className="grid grid-cols-3 gap-2">
          {THEME_PRESETS.map((preset) => (
            <button
              key={preset.id}
              onClick={() => set({ themeId: preset.id })}
              className={cn(
                'group flex flex-col items-center gap-1.5 rounded-md border p-2 transition-colors',
                settings.themeId === preset.id
                  ? 'border-zinc-400 bg-zinc-800'
                  : 'border-zinc-800 bg-zinc-900 hover:border-zinc-600',
              )}
              title={preset.label}
            >
              <span
                className="h-9 w-full rounded-sm border border-black/20"
                style={{
                  background: preset.previewBg,
                  boxShadow: `inset 0 0 0 9999px ${preset.previewBg}`,
                }}
              >
                <span
                  className="block h-full w-full rounded-sm px-1 pt-1 font-mono text-[10px] leading-none"
                  style={{ color: preset.previewFg, background: preset.previewBg }}
                >
                  $ ls
                </span>
              </span>
              <span
                className={cn(
                  'text-[11px]',
                  settings.themeId === preset.id
                    ? 'text-foreground'
                    : 'text-muted-foreground',
                )}
              >
                {preset.label}
              </span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
