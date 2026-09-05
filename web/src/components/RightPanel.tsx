import { ChevronRight } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { CommandsPanel } from './CommandsPanel';
import { HistoryPanel } from './HistoryPanel';
import { SettingsPanel } from './SettingsPanel';
import type { AppearanceSettings } from '../lib/appearance';

interface RightPanelProps {
  /** 插入命令/历史到当前激活终端 */
  onInsert: (content: string) => void;
  onCollapse?: () => void;
  showToast: (text: string, kind?: 'success' | 'error') => void;
  /** 终端显示设置（设置 Tab 编辑，全局生效） */
  appearance: AppearanceSettings;
  onAppearanceChange: (next: AppearanceSettings) => void;
  /** 历史版本号：命令执行后自增，历史面板据此自动刷新 */
  historyVersion: number;
}

/** 右栏：命令库 + 历史 + 设置（三个 Tab） */
export function RightPanel({
  onInsert,
  onCollapse,
  showToast,
  appearance,
  onAppearanceChange,
  historyVersion,
}: RightPanelProps) {
  return (
    <div className="flex h-full w-80 shrink-0 flex-col border-l bg-card">
      <Tabs defaultValue="commands" className="flex h-full min-h-0 flex-col">
        {/* 头部：TabsList */}
        <div className="flex shrink-0 items-center gap-1 border-b px-2 py-1.5">
          <TabsList className="h-8 w-full">
            <TabsTrigger value="commands" className="flex-1 text-xs">
              命令库
            </TabsTrigger>
            <TabsTrigger value="history" className="flex-1 text-xs">
              历史
            </TabsTrigger>
            <TabsTrigger value="settings" className="flex-1 text-xs">
              设置
            </TabsTrigger>
          </TabsList>
          {onCollapse && (
            <button
              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              title="收起"
              onClick={onCollapse}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* 内容区 */}
        <div className="min-h-0 flex-1">
          <TabsContent
            value="commands"
            className="mt-0 h-full overflow-hidden p-0"
          >
            <CommandsPanel onInsert={onInsert} showToast={showToast} />
          </TabsContent>
          <TabsContent value="history" className="mt-0 h-full overflow-hidden p-0">
            <HistoryPanel
              onInsert={onInsert}
              showToast={showToast}
              version={historyVersion}
            />
          </TabsContent>
          <TabsContent value="settings" className="mt-0 h-full overflow-hidden p-0">
            <SettingsPanel appearance={appearance} onChange={onAppearanceChange} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
