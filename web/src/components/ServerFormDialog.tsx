import { useEffect, useState } from 'react';
import { KeyRound, Lock } from 'lucide-react';
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
import { Checkbox } from './ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { serversApi } from '../api/client';
import type { AuthType, Server, ServerInput } from '../types';

interface ServerFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null 表示新增，否则编辑 */
  server: Server | null;
  /** 全部服务器（用于跳板机多选） */
  servers: Server[];
  onSaved: () => void;
  showToast: (text: string, kind?: 'success' | 'error') => void;
}

export function ServerFormDialog({
  open,
  onOpenChange,
  server,
  servers,
  onSaved,
  showToast,
}: ServerFormDialogProps) {
  const [name, setName] = useState('');
  const [host, setHost] = useState('');
  const [port, setPort] = useState('22');
  const [username, setUsername] = useState('');
  const [authType, setAuthType] = useState<AuthType>('password');
  const [password, setPassword] = useState('');
  const [keyPath, setKeyPath] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [proxyJump, setProxyJump] = useState<string[]>([]);
  const [favorite, setFavorite] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // 打开时初始化表单
  useEffect(() => {
    if (!open) return;
    if (server) {
      setName(server.name);
      setHost(server.host);
      setPort(String(server.port));
      setUsername(server.username);
      setAuthType(server.auth_type);
      setPassword('');
      setKeyPath(server.key_path ?? '');
      setPassphrase('');
      setProxyJump([...server.proxy_jump]);
      setFavorite(server.favorite);
    } else {
      setName('');
      setHost('');
      setPort('22');
      setUsername('');
      setAuthType('password');
      setPassword('');
      setKeyPath('');
      setPassphrase('');
      setProxyJump([]);
      setFavorite(false);
    }
    setFormError(null);
    setSaving(false);
  }, [open, server]);

  const isEdit = server !== null;

  const toggleProxy = (id: string) => {
    setProxyJump((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const portNum = Number(port);
    if (!name.trim() || !host.trim() || !username.trim()) {
      setFormError('名称、Host、用户名不能为空');
      return;
    }
    if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
      setFormError('端口必须是 1-65535 的整数');
      return;
    }
    if (authType === 'password' && !isEdit && !password) {
      setFormError('密码认证需要填写密码');
      return;
    }
    if (authType === 'key' && !isEdit && !keyPath.trim()) {
      setFormError('密钥认证需要填写私钥路径');
      return;
    }

    const payload: ServerInput = {
      name: name.trim(),
      host: host.trim(),
      port: portNum,
      username: username.trim(),
      auth_type: authType,
      proxy_jump: proxyJump,
      favorite,
    };
    if (authType === 'password') {
      // 编辑时密码留空表示不修改（CONTRACT.md §3）
      if (password) payload.password = password;
    } else {
      if (keyPath.trim()) payload.key_path = keyPath.trim();
      if (passphrase) payload.passphrase = passphrase;
    }

    setSaving(true);
    setFormError(null);
    try {
      if (isEdit) {
        await serversApi.update(server.id, payload);
        showToast(`服务器「${name.trim()}」已更新`);
      } else {
        await serversApi.create(payload);
        showToast(`服务器「${name.trim()}」已添加`);
      }
      onSaved();
      onOpenChange(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const proxyCandidates = servers.filter((s) => s.id !== server?.id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? `编辑服务器 ${server.name}` : '新增服务器'}</DialogTitle>
          <DialogDescription>
            连接信息会保存到后端；密码仅提交一次，不会返回给浏览器。
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="sf-name">名称 *</Label>
              <Input
                id="sf-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如 DEV-01"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="sf-host">Host *</Label>
              <Input
                id="sf-host"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="10.10.1.20 或 example.com"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="sf-port">端口</Label>
              <Input
                id="sf-port"
                type="number"
                min={1}
                max={65535}
                value={port}
                onChange={(e) => setPort(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="sf-user">用户名 *</Label>
              <Input
                id="sf-user"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="root / developer"
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label>认证方式</Label>
            <Select
              value={authType}
              onValueChange={(v) => setAuthType(v as AuthType)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="password">
                  <span className="flex items-center gap-2">
                    <Lock className="h-3.5 w-3.5" /> 密码 (password)
                  </span>
                </SelectItem>
                <SelectItem value="key">
                  <span className="flex items-center gap-2">
                    <KeyRound className="h-3.5 w-3.5" /> 私钥 (key)
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {authType === 'password' ? (
            <div className="grid gap-1.5">
              <Label htmlFor="sf-password">
                密码 {isEdit ? '（留空表示不修改）' : '*'}
              </Label>
              <Input
                id="sf-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isEdit ? '••••••' : 'SSH 密码'}
              />
            </div>
          ) : (
            <>
              <div className="grid gap-1.5">
                <Label htmlFor="sf-keypath">私钥路径 {isEdit ? '' : '*'}</Label>
                <Input
                  id="sf-keypath"
                  value={keyPath}
                  onChange={(e) => setKeyPath(e.target.value)}
                  placeholder="例如 ~/.ssh/id_ed25519"
                />
                <p className="text-xs text-muted-foreground">
                  私钥不会通过 API 返回给浏览器，仅保存路径。
                </p>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="sf-passphrase">私钥口令（可选）</Label>
                <Input
                  id="sf-passphrase"
                  type="password"
                  autoComplete="new-password"
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  placeholder="私钥加密口令"
                />
              </div>
            </>
          )}

          <div className="grid gap-1.5">
            <Label>跳板机（多选，按勾选顺序）</Label>
            {proxyCandidates.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                暂无可用的跳板机，可先添加其他服务器。
              </p>
            ) : (
              <div className="max-h-36 space-y-1 overflow-y-auto rounded-md border p-2">
                {proxyCandidates.map((s) => (
                  <label
                    key={s.id}
                    className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-accent"
                  >
                    <Checkbox
                      checked={proxyJump.includes(s.id)}
                      onCheckedChange={() => toggleProxy(s.id)}
                    />
                    <span className="truncate">{s.name}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {s.username}@{s.host}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={favorite}
              onCheckedChange={(v) => setFavorite(v === true)}
            />
            收藏（置顶显示）
          </label>

          {formError && (
            <p className="text-sm text-destructive">{formError}</p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              取消
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? '保存中…' : isEdit ? '保存修改' : '添加服务器'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
