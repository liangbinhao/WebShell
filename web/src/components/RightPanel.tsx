import { ChevronRight } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { CommandsPanel } from './CommandsPanel';
import { HistoryPanel } from './HistoryPanel';

interface RightPanelProps {
  /** 插入命令/历史到当前激活终端 */
  onInsert: (content: string) => void;
  onCollapse?: () => void;
  showToast: (text: string, kind?: 'success' | 'error') => void;
}

/** 右栏：命令库 + 历史（两个 Tab） */
export function RightPanel({ onInsert, onCollapse, showToast }: RightPanelProps) {
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
            <HistoryPanel onInsert={onInsert} showToast={showToast} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
