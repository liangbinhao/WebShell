import * as React from 'react';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface ConfirmDialogProps {
  /** 触发确认的元素（Button 等） */
  trigger: React.ReactNode;
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  /** 确认按钮变体（默认 destructive） */
  confirmVariant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
}

/** 通用删除/危险操作确认对话框 */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmText = '确认',
  cancelText = '取消',
  onConfirm,
  confirmVariant = 'destructive',
}: ConfirmDialogProps) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description ? (
            <AlertDialogDescription className="whitespace-pre-line">
              {description}
            </AlertDialogDescription>
          ) : null}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{cancelText}</AlertDialogCancel>
          {/* 不要 preventDefault：Radix 的 AlertDialog.Action 依赖默认行为关闭弹窗，
              阻止后点击"确认"对话框不会关闭（只有"取消"能关）。
              异步操作（删除/清空）在弹窗关闭后继续执行，结果由 toast 反馈。 */}
          <AlertDialogAction
            className={cn(buttonVariants({ variant: confirmVariant }))}
            onClick={() => onConfirm()}
          >
            {confirmText}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
