import { useCallback, useEffect, useState } from 'react';
import {
  ChevronLeft,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Server,
  Star,
  Trash2,
} from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { ConfirmDialog } from './ui/confirm-dialog';
import { ServerFormDialog } from './ServerFormDialog';
import { serversApi } from '../api/client';
import type { Server as ServerType } from '../types';
import { cn } from '@/lib/utils';

interface ServersPanelProps {
  /** 点击服务器 -> 打开新的终端 Tab */
  onOpenTerminal: (server: ServerType) => void;
  onCollapse?: () => void;
  showToast: (text: string, kind?: 'success' | 'error') => void;
}

/** 左栏：服务器管理（requirements.md §5 / §15） */
export function ServersPanel({
  onOpenTerminal,
  onCollapse,
  showToast,
}: ServersPanelProps) {
  const [servers, setServers] = useState<ServerType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ServerType | null>(null);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setServers(await serversApi.list());
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载服务器列表失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleFavorite = async (s: ServerType) => {
    const next = !s.favorite;
    // 乐观更新
    setServers((prev) =>
      prev.map((x) => (x.id === s.id ? { ...x, favorite: next } : x)),
    );
    setBusyIds((prev) => new Set(prev).add(s.id));
    try {
      await serversApi.toggleFavorite(s.id, next);
    } catch (err) {
      setServers((prev) =>
        prev.map((x) => (x.id === s.id ? { ...x, favorite: s.favorite } : x)),
      );
      showToast(err instanceof Error ? err.message : '切换收藏失败', 'error');
    } finally {
      setBusyIds((prev) => {
        const n = new Set(prev);
        n.delete(s.id);
        return n;
      });
    }
  };

  const removeServer = async (s: ServerType) => {
    try {
      await serversApi.remove(s.id);
      setServers((prev) => prev.filter((x) => x.id !== s.id));
      showToast(`服务器「${s.name}」已删除`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : '删除失败', 'error');
    }
  };

  // 收藏在前，其余按名称排序
  const sorted = [...servers].sort((a, b) => {
    if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
    return a.name.localeCompare(b.name, 'zh-CN');
  });

  return (
    <div className="flex h-full w-72 shrink-0 flex-col border-r bg-card">
      {/* 面板头 */}
      <div className="flex h-11 shrink-0 items-center gap-2 border-b px-3">
        <Server className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-semibold">服务器</span>
        <span className="rounded bg-muted px-1.5 text-xs text-muted-foreground">
          {servers.length}
        </span>
        <div className="ml-auto flex items-center gap-0.5">
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
            title="新增服务器"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
          </Button>
          {onCollapse && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              title="收起"
              onClick={onCollapse}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* 列表 */}
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {loading && servers.length === 0 ? (
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
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-3 py-8 text-center text-muted-foreground">
            <Server className="h-8 w-8 opacity-30" />
            <p className="text-sm">还没有服务器</p>
            <p className="text-xs">点击右上角 + 添加，或等待后端返回数据</p>
          </div>
        ) : (
          <div className="space-y-1">
            {sorted.map((s) => {
              const isBusy = busyIds.has(s.id);
              return (
                <div
                  key={s.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onOpenTerminal(s)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') onOpenTerminal(s);
                  }}
                  className="group flex cursor-pointer items-start gap-2 rounded-md border border-transparent px-2 py-2 hover:border-border hover:bg-accent/60"
                  title={`点击连接 ${s.username}@${s.host}:${s.port}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium">{s.name}</span>
                      {s.favorite && (
                        <Star className="h-3 w-3 shrink-0 fill-yellow-400 text-yellow-400" />
                      )}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">
                      {s.username}@{s.host}:{s.port}
                    </div>
                    <div className="mt-1 flex items-center gap-1">
                      <Badge
                        variant={s.auth_type === 'key' ? 'secondary' : 'outline'}
                        className="text-[10px]"
                      >
                        {s.auth_type === 'key' ? 'Key' : 'Password'}
                      </Badge>
                      {s.proxy_jump.length > 0 && (
                        <Badge variant="outline" className="text-[10px]">
                          跳板 ×{s.proxy_jump.length}
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-0.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      className={cn(
                        'h-6 w-6',
                        s.favorite ? 'text-yellow-400' : 'opacity-0 group-hover:opacity-100',
                      )}
                      title={s.favorite ? '取消收藏' : '收藏'}
                      disabled={isBusy}
                      onClick={(e) => {
                        e.stopPropagation();
                        void toggleFavorite(s);
                      }}
                    >
                      <Star
                        className={cn(
                          'h-3.5 w-3.5',
                          s.favorite && 'fill-yellow-400 text-yellow-400',
                        )}
                      />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100"
                      title="编辑"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditing(s);
                        setFormOpen(true);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <ConfirmDialog
                      title="删除服务器"
                      description={`确定删除服务器「${s.name}」（${s.host}）？已打开的终端会话不受影响。`}
                      confirmText="删除"
                      trigger={
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 opacity-0 group-hover:opacity-100 hover:text-destructive"
                          title="删除"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      }
                      onConfirm={() => void removeServer(s)}
                    />
                  </div>
                </div>
              );
            })}
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
          添加服务器
        </Button>
      </div>

      <ServerFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        server={editing}
        servers={servers}
        onSaved={() => void load()}
        showToast={showToast}
      />
    </div>
  );
}
