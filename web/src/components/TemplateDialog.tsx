import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { extractPlaceholders, fillTemplate } from '../lib/template';
import type { Command } from '../types';

interface TemplateDialogProps {
  /** 待填写的命令（含 {占位符}） */
  command: Command | null;
  onOpenChange: (open: boolean) => void;
  /** 填充完成后回调，参数为生成好的完整命令 */
  onInsert: (content: string) => void;
}

/** 命令模板参数表单（requirements.md §11） */
export function TemplateDialog({
  command,
  onOpenChange,
  onInsert,
}: TemplateDialogProps) {
  const [values, setValues] = useState<Record<string, string>>({});

  const params = command ? extractPlaceholders(command.content) : [];

  useEffect(() => {
    if (command) {
      const init: Record<string, string> = {};
      for (const p of extractPlaceholders(command.content)) init[p] = '';
      setValues(init);
    } else {
      setValues({});
    }
  }, [command]);

  if (!command) return null;

  const handleConfirm = () => {
    onInsert(fillTemplate(command.content, values));
    onOpenChange(false);
  };

  return (
    <Dialog open={command !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>填写参数：{command.name}</DialogTitle>
          <DialogDescription className="break-all font-mono text-xs">
            {command.content}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          {params.length === 0 ? (
            <p className="text-sm text-muted-foreground">该命令不包含参数。</p>
          ) : (
            params.map((p) => (
              <div key={p} className="grid gap-1.5">
                <Label htmlFor={`tp-${p}`}>{p}</Label>
                <Input
                  id={`tp-${p}`}
                  value={values[p] ?? ''}
                  onChange={(e) => setValues((v) => ({ ...v, [p]: e.target.value }))}
                  autoFocus={params[0] === p}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleConfirm();
                    }
                  }}
                />
              </div>
            ))
          )}
          <div className="rounded-md border bg-muted/40 p-2">
            <p className="mb-1 text-xs text-muted-foreground">生成预览</p>
            <pre className="overflow-x-auto whitespace-pre-wrap break-all font-mono text-xs text-foreground">
              {fillTemplate(command.content, values) || '（空）'}
            </pre>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleConfirm}>插入到终端</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
