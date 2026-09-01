import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { Circle, RotateCcw, X } from 'lucide-react';
import { Terminal, type TerminalHandle } from './Terminal';
import { Button } from './ui/button';
import { historyApi } from '../api/client';
import type { ConnectionState } from '../api/terminal';
import { genId } from '../lib/format';
import type { Server } from '../types';
import { cn } from '@/lib/utils';

export interface TabItem {
  id: string;
  server: Server;
  state: ConnectionState;
  errorMessage?: string;
}

export interface TerminalTabsHandle {
  openTab: (server: Server) => void;
  insertToActive: (text: string) => boolean;
  focusActive: () => void;
  reconnectActive: () => void;
}

interface TerminalTabsProps {
  className?: string;
  /** 命令历史记录（requirements.md §12） */
  onHistoryRecord?: (tab: TabItem, command: string) => void;
  /** 终端显示设置（全局共享） */
  settings: import('../lib/terminal-settings').TerminalSettings;
}

const STATUS_META: Record<
  ConnectionState,
  { label: string; dotClass: string; textClass: string }
> = {
  connecting: { label: 'Connecting', dotClass: 'bg-yellow-400', textClass: 'text-yellow-400' },
  connected: { label: 'Connected', dotClass: 'bg-emerald-500', textClass: 'text-emerald-500' },
  disconnected: { label: 'Disconnected', dotClass: 'bg-zinc-500', textClass: 'text-zinc-400' },
  error: { label: 'Error', dotClass: 'bg-red-500', textClass: 'text-red-500' },
};

/**
 * 中栏：多 Tab 终端（requirements.md §8）
 * - 每个 Tab 一个独立 Terminal 组件（独立 WebSocket / SSH 会话）
 * - 切换 Tab 不卸载其他会话（display:none 隐藏，保持连接）
 */
const TerminalTabs = forwardRef<TerminalTabsHandle, TerminalTabsProps>(
  function TerminalTabs({ className, onHistoryRecord, settings }, ref) {
    const [tabs, setTabs] = useState<TabItem[]>([]);
    const [activeId, setActiveId] = useState<string | null>(null);
    const activeTerminalRef = useRef<TerminalHandle | null>(null);

    const openTab = useCallback((server: Server) => {
      const id = genId('tab');
      const tab: TabItem = { id, server, state: 'connecting' };
      setTabs((prev) => [...prev, tab]);
      setActiveId(id);
    }, []);

    const closeTab = useCallback((id: string) => {
      setTabs((prev) => {
        const idx = prev.findIndex((t) => t.id === id);
        const next = prev.filter((t) => t.id !== id);
        setActiveId((cur) => {
          if (cur !== id) return cur;
          // 关闭激活 tab 时激活相邻 tab
          if (next.length === 0) return null;
          const neighbor = next[Math.max(0, idx - 1)];
          return neighbor.id;
        });
        return next;
      });
    }, []);

    const updateStatus = useCallback(
      (id: string, state: ConnectionState, errorMessage?: string) => {
        setTabs((prev) =>
          prev.map((t) => (t.id === id ? { ...t, state, errorMessage } : t)),
        );
      },
      [],
    );

    const handleCommand = useCallback(
      (tab: TabItem, command: string) => {
        onHistoryRecord?.(tab, command);
        // 默认兜底：直接记录到后端（不阻塞终端）
        if (!onHistoryRecord) {
          historyApi
            .record({
              server_id: tab.server.id,
              server_name: tab.server.name,
              username: tab.server.username,
              command,
            })
            .catch(() => {
              // 后端不可用时静默失败，不影响终端
            });
        }
      },
      [onHistoryRecord],
    );

    const insertToActive = useCallback((text: string) => {
      const handle = activeTerminalRef.current;
      if (!handle) return false;
      handle.insertText(text);
      return true;
    }, []);

    const focusActive = useCallback(() => {
      activeTerminalRef.current?.focus();
    }, []);

    const reconnectActive = useCallback(() => {
      activeTerminalRef.current?.reconnect();
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        openTab,
        insertToActive,
        focusActive,
        reconnectActive,
      }),
      [openTab, insertToActive, focusActive, reconnectActive],
    );

    const activeTab = tabs.find((t) => t.id === activeId) ?? null;
    const status = activeTab ? STATUS_META[activeTab.state] : null;

    return (
      <div className={cn('flex h-full min-w-0 flex-col bg-background', className)}>
        {/* Tab 栏 */}
        <div className="flex h-9 shrink-0 items-center gap-1 overflow-x-auto border-b bg-muted/40 px-2">
          {tabs.map((tab) => {
            const meta = STATUS_META[tab.state];
            const isActive = tab.id === activeId;
            return (
              <div
                key={tab.id}
                role="button"
                tabIndex={0}
                onClick={() => setActiveId(tab.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') setActiveId(tab.id);
                }}
                className={cn(
                  'group flex h-7 shrink-0 cursor-pointer select-none items-center gap-1.5 rounded-t-md border border-b-0 px-2.5 text-xs transition-colors',
                  isActive
                    ? 'border-border bg-background text-foreground'
                    : 'border-transparent text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                )}
                title={`${tab.server.username}@${tab.server.host}:${tab.server.port}`}
              >
                <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', meta.dotClass)} />
                <span className="max-w-[140px] truncate font-medium">{tab.server.name}</span>
                <span className="max-w-[80px] truncate text-[10px] text-muted-foreground">
                  {tab.server.username}@{tab.server.host}
                </span>
                <button
                  className={cn(
                    'ml-0.5 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground',
                    isActive ? 'opacity-60' : 'opacity-0 group-hover:opacity-60',
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(tab.id);
                  }}
                  title="关闭"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            );
          })}
          {tabs.length === 0 && (
            <span className="px-2 text-xs text-muted-foreground">
              在左侧点击服务器以打开终端
            </span>
          )}
        </div>

        {/* 终端区 */}
        <div className="relative min-h-0 flex-1">
          {tabs.map((tab) => {
            const isActive = tab.id === activeId;
            return (
              <div
                key={tab.id}
                className={cn(
                  'flex-col',
                  isActive ? 'absolute inset-0 flex' : 'hidden',
                )}
              >
                {/* 连接状态条 */}
                <div className="flex h-8 shrink-0 items-center gap-2 border-b bg-card px-3">
                  <span
                    className={cn('h-2 w-2 rounded-full', status?.dotClass)}
                    title={tab.state}
                  />
                  <span className={cn('text-xs font-medium', status?.textClass)}>
                    {tab.state === 'error'
                      ? 'Error'
                      : STATUS_META[tab.state].label}
                  </span>
                  {tab.state === 'error' && tab.errorMessage && (
                    <span className="truncate text-xs text-muted-foreground">
                      {tab.errorMessage}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {tab.server.name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {tab.server.username}@{tab.server.host}:{tab.server.port}
                  </span>
                  <div className="ml-auto flex items-center gap-1">
                    {(tab.state === 'disconnected' || tab.state === 'error') && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 gap-1 text-xs"
                        onClick={() => {
                          const handle =
                            activeTerminalRef.current;
                          handle?.reconnect();
                        }}
                      >
                        <RotateCcw className="h-3 w-3" />
                        重新连接
                      </Button>
                    )}
                  </div>
                </div>
                {/* xterm */}
                <div className="min-h-0 flex-1">
                  <Terminal
                    ref={isActive ? activeTerminalRef : undefined}
                    serverId={tab.server.id}
                    active={isActive}
                    onStatusChange={(s, err) => updateStatus(tab.id, s, err)}
                    onCommand={(cmd) => handleCommand(tab, cmd)}
                    settings={settings}
                  />
                </div>
              </div>
            );
          })}

          {tabs.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
              <Circle className="h-10 w-10 opacity-30" />
              <p className="text-sm">还没有打开的终端</p>
              <p className="text-xs">从左侧服务器列表选择一个服务器开始连接</p>
            </div>
          )}
        </div>
      </div>
    );
  },
);

export { TerminalTabs };
