import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronsLeft, ChevronsRight, CheckCircle2, TerminalSquare } from 'lucide-react';
import { ServersPanel } from './components/ServersPanel';
import { TerminalTabs, type TerminalTabsHandle } from './components/TerminalTabs';
import { RightPanel } from './components/RightPanel';
import { historyApi } from './api/client';
import type { TabItem } from './components/TerminalTabs';
import type { Server } from './types';
import {
  applyAppearanceToDom,
  loadAppearance,
  saveAppearance,
  type AppearanceSettings,
} from './lib/appearance';
import { cn } from '@/lib/utils';

interface ToastState {
  text: string;
  kind: 'success' | 'error';
}

/** 三栏布局主界面（requirements.md §15） */
export default function App() {
  const terminalTabsRef = useRef<TerminalTabsHandle>(null);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastTimerRef = useRef<number | undefined>(undefined);
  /** 全局外观设置（UI 主题/缩放/终端显示，localStorage 持久化） */
  const [appearance, setAppearance] = useState<AppearanceSettings>(loadAppearance);
  /** 历史版本号：命令执行后自增，HistoryPanel 据此自动刷新 */
  const [historyVersion, setHistoryVersion] = useState(0);

  // 外观变化 → 应用到 DOM（html class 主题 + zoom 缩放）
  useEffect(() => {
    applyAppearanceToDom(appearance);
  }, [appearance]);

  const handleAppearanceChange = useCallback((next: AppearanceSettings) => {
    setAppearance(next);
    saveAppearance(next);
  }, []);

  const showToast = useCallback((text: string, kind: 'success' | 'error' = 'success') => {
    setToast({ text, kind });
    window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 3000);
  }, []);

  /** 命令库/历史 -> 插入当前激活终端 */
  const handleInsert = useCallback((content: string) => {
    const ok = terminalTabsRef.current?.insertToActive(content) ?? false;
    if (!ok) {
      showToast('请先在左侧打开一个终端会话', 'error');
    }
  }, [showToast]);

  /** 终端命令执行 -> 记录历史（requirements.md §12） */
  const handleHistoryRecord = useCallback((tab: TabItem, command: string) => {
    historyApi
      .record({
        server_id: tab.server.id,
        server_name: tab.server.name,
        username: tab.server.username,
        command,
      })
      .then(() => {
        // 记录成功 → 通知历史面板刷新（同命令去重后时间应更新）
        setHistoryVersion((v) => v + 1);
      })
      .catch(() => {
        // 后端不可用时静默失败，不影响终端体验
      });
  }, []);

  return (
    // h-full 跟随 #root 的 100% 链（html/body/#root 均已设 height:100%）：
    // 相比 100vh，100% 是浏览器实际可视区高度，不会被 Windows 任务栏遮挡底部。
    <div className="flex h-full min-w-0 flex-col overflow-hidden bg-background text-foreground">
      {/* 顶栏 */}
      <header className="flex h-11 shrink-0 items-center gap-2 border-b bg-card px-4">
        <TerminalSquare className="h-5 w-5 text-emerald-500" />
        <h1 className="text-sm font-semibold tracking-wide">Web SSH Workspace</h1>
        <span className="rounded bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
          个人 SSH 运维工作台
        </span>
        <div className="ml-auto flex items-center gap-2 text-[11px] text-muted-foreground">
          {leftOpen ? (
            <button
              className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-accent hover:text-foreground"
              onClick={() => setLeftOpen(false)}
              title="收起左侧面板"
            >
              <ChevronsLeft className="h-3.5 w-3.5" />
              服务器
            </button>
          ) : null}
          {rightOpen ? (
            <button
              className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-accent hover:text-foreground"
              onClick={() => setRightOpen(false)}
              title="收起右侧面板"
            >
              命令库
              <ChevronsRight className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      </header>

      {/* 三栏主体 */}
      <div className="flex min-h-0 flex-1">
        {/* 左栏：服务器 */}
        {leftOpen ? (
          <ServersPanel
            onOpenTerminal={(server: Server) =>
              terminalTabsRef.current?.openTab(server)
            }
            onCollapse={() => setLeftOpen(false)}
            showToast={showToast}
          />
        ) : (
          <button
            className="flex w-7 shrink-0 flex-col items-center justify-center border-r bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
            onClick={() => setLeftOpen(true)}
            title="展开服务器列表"
          >
            <ChevronsRight className="h-4 w-4" />
            <span className="mt-1 text-[10px] [writing-mode:vertical-rl]">服务器</span>
          </button>
        )}

        {/* 中栏：多 Tab 终端 */}
        <TerminalTabs
          ref={terminalTabsRef}
          className="min-w-0 flex-1"
          onHistoryRecord={handleHistoryRecord}
          appearance={appearance}
        />

        {/* 右栏：命令库 + 历史 + 设置 */}
        {rightOpen ? (
          <RightPanel
            onInsert={handleInsert}
            onCollapse={() => setRightOpen(false)}
            showToast={showToast}
            appearance={appearance}
            onAppearanceChange={handleAppearanceChange}
            historyVersion={historyVersion}
          />
        ) : (
          <button
            className="flex w-7 shrink-0 flex-col items-center justify-center border-l bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
            onClick={() => setRightOpen(true)}
            title="展开命令库"
          >
            <ChevronsLeft className="h-4 w-4" />
            <span className="mt-1 text-[10px] [writing-mode:vertical-rl]">命令库</span>
          </button>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={cn(
            'fixed bottom-4 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-2 rounded-md border px-4 py-2 text-sm shadow-lg',
            toast.kind === 'success'
              ? 'border-emerald-500/40 bg-emerald-950/90 text-emerald-200'
              : 'border-destructive/40 bg-red-950/90 text-red-200',
          )}
        >
          <CheckCircle2
            className={cn(
              'h-4 w-4',
              toast.kind === 'success' ? 'text-emerald-400' : 'text-red-400',
            )}
          />
          {toast.text}
        </div>
      )}
    </div>
  );
}
