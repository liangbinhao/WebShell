import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Clock,
  Loader2,
  RefreshCw,
  Search,
  SquareTerminal,
  Trash2,
} from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { ConfirmDialog } from './ui/confirm-dialog';
import { historyApi } from '../api/client';
import { formatTime } from '../lib/format';
import type { HistoryEntry } from '../types';

interface HistoryPanelProps {
  /** 重新插入终端 */
  onInsert: (content: string) => void;
  showToast: (text: string, kind?: 'success' | 'error') => void;
  /** 版本号变化时自动重新加载（命令执行后由 App 自增触发） */
  version?: number;
}

/** 命令历史（requirements.md §12）：列表 / 搜索 / 删除 / 重新插入 */
export function HistoryPanel({ onInsert, showToast, version = 0 }: HistoryPanelProps) {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const debounceRef = useRef<number | undefined>(undefined);

  const load = useCallback(async (query?: string) => {
    setLoading(true);
    setError(null);
    try {
      setEntries(await historyApi.list(query));
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载历史失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(q.trim() || undefined);
    return () => window.clearTimeout(debounceRef.current);
    // version 变化（新命令执行）时自动刷新；q 变化由 onSearchChange 防抖处理
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, version]);

  const onSearchChange = (value: string) => {
    setQ(value);
    window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      void load(value.trim() || undefined);
    }, 300);
  };

  const removeEntry = async (entry: HistoryEntry) => {
    try {
      await historyApi.remove(entry.id);
      setEntries((prev) => prev.filter((x) => x.id !== entry.id));
      showToast('历史记录已删除');
    } catch (err) {
      showToast(err instanceof Error ? err.message : '删除失败', 'error');
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* 头部 */}
      <div className="flex h-11 shrink-0 items-center gap-2 px-3">
        <Clock className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-semibold">历史</span>
        <span className="rounded bg-muted px-1.5 text-xs text-muted-foreground">
          {entries.length}
        </span>
        <div className="ml-auto">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            title="刷新"
            onClick={() => void load(q.trim() || undefined)}
            disabled={loading}
          >
            <RefreshCw className={loading ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
          </Button>
        </div>
      </div>

      {/* 搜索 */}
      <div className="shrink-0 px-3 pb-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="搜索历史命令…"
            className="h-8 pl-8 text-xs"
          />
        </div>
      </div>

      {/* 列表 */}
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {loading && entries.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-xs">加载中…</span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-3 px-3 py-8 text-center">
            <p className="text-sm text-destructive">无法连接后端</p>
            <p className="text-xs text-muted-foreground">{error}</p>
            <Button variant="outline" size="sm" onClick={() => void load()}>
              重试
            </Button>
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-3 py-10 text-center text-muted-foreground">
            <SquareTerminal className="h-8 w-8 opacity-30" />
            <p className="text-sm">{q ? '没有匹配的历史记录' : '还没有历史命令'}</p>
            <p className="text-xs">
              在终端中执行命令后自动记录（同命令去重，保留最近 200 条）
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className="group rounded-md border border-transparent px-2 py-1.5 hover:border-border hover:bg-accent/60"
              >
                {/* 仅命令文本区可点击插入；外层容器无 onClick/onKeyDown，
                    避免删除按钮的点击/焦点事件冒泡误触发插入 */}
                <p
                  role="button"
                  tabIndex={0}
                  onClick={() => onInsert(entry.command)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') onInsert(entry.command);
                  }}
                  className="truncate font-mono text-xs text-foreground hover:underline"
                  title="点击重新插入到终端"
                >
                  {entry.command}
                </p>
                <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span className="truncate">{formatTime(entry.executed_at)}</span>
                  <span className="shrink-0 text-muted-foreground/50">·</span>
                  <span className="shrink-0">{entry.server_name}</span>
                  <span className="shrink-0 text-muted-foreground/50">·</span>
                  <span className="shrink-0">{entry.username}</span>
                  <div className="ml-auto shrink-0">
                    <ConfirmDialog
                      title="删除历史记录"
                      description={`确定删除该条历史命令？\n${entry.command}`}
                      confirmText="删除"
                      trigger={
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 opacity-0 group-hover:opacity-100 hover:text-destructive"
                          title="删除"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      }
                      onConfirm={() => void removeEntry(entry)}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
