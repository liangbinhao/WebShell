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
import { Textarea } from './ui/textarea';
import { Checkbox } from './ui/checkbox';
import { commandsApi } from '../api/client';
import type { Command, CommandInput } from '../types';

interface CommandFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null 表示新增，否则编辑 */
  command: Command | null;
  /** 已有分类（用于 datalist 建议） */
  categories: string[];
  onSaved: () => void;
  showToast: (text: string, kind?: 'success' | 'error') => void;
}

export function CommandFormDialog({
  open,
  onOpenChange,
  command,
  categories,
  onSaved,
  showToast,
}: CommandFormDialogProps) {
  const [name, setName] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [favorite, setFavorite] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (command) {
      setName(command.name);
      setContent(command.content);
      setCategory(command.category);
      setDescription(command.description);
      setFavorite(command.favorite);
    } else {
      setName('');
      setContent('');
      setCategory('');
      setDescription('');
      setFavorite(false);
    }
    setFormError(null);
    setSaving(false);
  }, [open, command]);

  const isEdit = command !== null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !content.trim()) {
      setFormError('名称和命令内容不能为空');
      return;
    }
    const payload: CommandInput = {
      name: name.trim(),
      content: content.trim(),
      category: category.trim() || '未分类',
      description: description.trim(),
      favorite,
    };
    setSaving(true);
    setFormError(null);
    try {
      if (isEdit) {
        await commandsApi.update(command.id, payload);
        showToast(`命令「${name.trim()}」已更新`);
      } else {
        await commandsApi.create(payload);
        showToast(`命令「${name.trim()}」已添加`);
      }
      onSaved();
      onOpenChange(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? '编辑命令' : '新增命令'}</DialogTitle>
          <DialogDescription>
            支持 {`{参数名}`} 占位符，插入时会弹出参数表单生成完整命令。
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="cf-name">名称 *</Label>
              <Input
                id="cf-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如 查看磁盘"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cf-category">分类</Label>
              <Input
                id="cf-category"
                list="cf-category-list"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="例如 Linux / Docker"
              />
              <datalist id="cf-category-list">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="cf-content">命令内容 *</Label>
            <Textarea
              id="cf-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={'例如 docker logs --tail {lines} -f {container}'}
              className="min-h-[90px] font-mono text-xs"
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="cf-desc">描述</Label>
            <Input
              id="cf-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="命令用途说明（可选）"
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={favorite}
              onCheckedChange={(v) => setFavorite(v === true)}
            />
            收藏
          </label>

          {formError && <p className="text-sm text-destructive">{formError}</p>}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              取消
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? '保存中…' : isEdit ? '保存修改' : '添加命令'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
