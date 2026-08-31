import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  Folder,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Star,
  Trash2,
} from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { ConfirmDialog } from './ui/confirm-dialog';
import { CommandFormDialog } from './CommandFormDialog';
import { TemplateDialog } from './TemplateDialog';
import { commandsApi } from '../api/client';
import { extractPlaceholders } from '../lib/template';
import type { Command } from '../types';
import { cn } from '@/lib/utils';

interface CommandsPanelProps {
  /** 插入命令到当前激活终端 */
  onInsert: (content: string) => void;
  showToast: (text: string, kind?: 'success' | 'error') => void;
}

/** 右栏：常用命令库（requirements.md §10 / §11） */
export function CommandsPanel({ onInsert, showToast }: CommandsPanelProps) {
  const [commands, setCommands] = useState<Command[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [onlyFavorite, setOnlyFavorite] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Command | null>(null);
  const [templateCommand, setTemplateCommand] = useState<Command | null>(null);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setCommands(await commandsApi.list());
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载命令库失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const categories = useMemo(
    () => [...new Set(commands.map((c) => c.category || '未分类'))].sort((a, b) => a.localeCompare(b, 'zh-CN')),
    [commands],
  );

  // 按分类分组（分类 -> 命令列表）
  const groups = useMemo(() => {
    const list = onlyFavorite ? commands.filter((c) => c.favorite) : commands;
    const map = new Map<string, Command[]>();
    for (const c of list) {
      const cat = c.category || '未分类';
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(c);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'zh-CN'));
  }, [commands, onlyFavorite]);

  const handleItemClick = (cmd: Command) => {
    if (extractPlaceholders(cmd.content).length > 0) {
      setTemplateCommand(cmd);
    } else {
      onInsert(cmd.content);
    }
  };

  const toggleFavorite = async (cmd: Command) => {
    const next = !cmd.favorite;
    setCommands((prev) =>
      prev.map((x) => (x.id === cmd.id ? { ...x, favorite: next } : x)),
    );
    setBusyIds((prev) => new Set(prev).add(cmd.id));
    try {
      await commandsApi.toggleFavorite(cmd.id, next);
    } catch (err) {
      setCommands((prev) =>
        prev.map((x) => (x.id === cmd.id ? { ...x, favorite: cmd.favorite } : x)),
      );
      showToast(err instanceof Error ? err.message : '切换收藏失败', 'error');
    } finally {
      setBusyIds((prev) => {
        const n = new Set(prev);
        n.delete(cmd.id);
        return n;
      });
    }
  };

  const removeCommand = async (cmd: Command) => {
    try {
      await commandsApi.remove(cmd.id);
      setCommands((prev) => prev.filter((x) => x.id !== cmd.id));
      showToast(`命令「${cmd.name}」已删除`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : '删除失败', 'error');
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* 头部 */}
      <div className="flex h-11 shrink-0 items-center gap-2 px-3">
        <BookOpen className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-semibold">命令库</span>
        <span className="rounded bg-muted px-1.5 text-xs text-muted-foreground">
          {commands.length}
        </span>
        <div className="ml-auto flex items-center gap-0.5">
          <Button
            variant={onlyFavorite ? 'secondary' : 'ghost'}
            size="icon"
            className="h-7 w-7"
            title={onlyFavorite ? '显示全部' : '只看收藏'}
            onClick={() => setOnlyFavorite((v) => !v)}
          >
            <Star
              className={cn(
                'h-3.5 w-3.5',
                onlyFavorite && 'fill-yellow-400 text-yellow-400',
              )}
            />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            title="刷新"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            title="新增命令"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* 分组列表 */}
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {loading && commands.length === 0 ? (
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
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-3 py-8 text-center text-muted-foreground">
            <Folder className="h-8 w-8 opacity-30" />
            <p className="text-sm">
              {onlyFavorite ? '没有收藏的命令' : '命令库为空'}
            </p>
            <p className="text-xs">点击右上角 + 添加常用命令</p>
          </div>
        ) : (
          <div className="space-y-3">
            {groups.map(([cat, items]) => (
              <div key={cat}>
                <div className="mb-1 flex items-center gap-1.5 px-1">
                  <Folder className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-semibold text-muted-foreground">
                    {cat}
                  </span>
                  <span className="text-[10px] text-muted-foreground/60">
                    {items.length}
                  </span>
                </div>
                <div className="space-y-1">
                  {items.map((cmd) => {
                    const hasParams = extractPlaceholders(cmd.content).length > 0;
                    const isBusy = busyIds.has(cmd.id);
                    return (
                      <div
                        key={cmd.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => handleItemClick(cmd)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') handleItemClick(cmd);
                        }}
                        className="group cursor-pointer rounded-md border border-transparent px-2 py-1.5 hover:border-border hover:bg-accent/60"
                        title={hasParams ? '含参数，点击填写参数' : `插入: ${cmd.content}`}
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-sm">{cmd.name}</span>
                          {hasParams && (
                            <Badge variant="outline" className="shrink-0 text-[10px]">
                              模板
                            </Badge>
                          )}
                          {cmd.favorite && (
                            <Star className="h-3 w-3 shrink-0 fill-yellow-400 text-yellow-400" />
                          )}
                          <div className="ml-auto flex shrink-0 items-center gap-0.5">
                            <Button
                              variant="ghost"
                              size="icon"
                              className={cn(
                                'h-5 w-5',
                                cmd.favorite
                                  ? 'text-yellow-400'
                                  : 'opacity-0 group-hover:opacity-100',
                              )}
                              title={cmd.favorite ? '取消收藏' : '收藏'}
                              disabled={isBusy}
                              onClick={(e) => {
                                e.stopPropagation();
                                void toggleFavorite(cmd);
                              }}
                            >
                              <Star
                                className={cn(
                                  'h-3 w-3',
                                  cmd.favorite && 'fill-yellow-400 text-yellow-400',
                                )}
                              />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5 opacity-0 group-hover:opacity-100"
                              title="编辑"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditing(cmd);
                                setFormOpen(true);
                              }}
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <ConfirmDialog
                              title="删除命令"
                              description={`确定删除命令「${cmd.name}」？`}
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
                              onConfirm={() => void removeCommand(cmd)}
                            />
                          </div>
                        </div>
                        {cmd.description && (
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {cmd.description}
                          </p>
                        )}
                        <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground/80">
                          {cmd.content}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 底部添加按钮 */}
      <div className="shrink-0 border-t p-2">
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          <Plus className="h-4 w-4" />
          添加命令
        </Button>
      </div>

      <CommandFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        command={editing}
        categories={categories}
        onSaved={() => void load()}
        showToast={showToast}
      />
      <TemplateDialog
        command={templateCommand}
        onOpenChange={(open) => {
          if (!open) setTemplateCommand(null);
        }}
        onInsert={onInsert}
      />
    </div>
  );
}
