import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button.js';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.js';
import { Input } from '@/components/ui/input.js';
import { Textarea } from '@/components/ui/textarea.js';
import { useAddMcpServer, useTestMcpConnection } from '@/hooks/use-extensions.js';

interface ImportMcpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string | null;
}

const selectClass =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

export function ImportMcpDialog({ open, onOpenChange, companyId }: ImportMcpDialogProps) {
  const addMcpServer = useAddMcpServer(companyId);
  const testConnection = useTestMcpConnection();
  const [name, setName] = useState('');
  const [transport, setTransport] = useState<'stdio' | 'sse'>('stdio');
  const [command, setCommand] = useState('');
  const [argsText, setArgsText] = useState('');
  const [envText, setEnvText] = useState('{}');
  const [url, setUrl] = useState('');

  const configJson = useMemo(() => {
    if (transport === 'sse') {
      return JSON.stringify({ url: url.trim() });
    }
    let env: Record<string, string> | undefined;
    try {
      const parsed = JSON.parse(envText.trim() || '{}');
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        env = Object.fromEntries(
          Object.entries(parsed).filter(
            (entry): entry is [string, string] =>
              typeof entry[0] === 'string' && typeof entry[1] === 'string',
          ),
        );
      }
    } catch {
      env = undefined;
    }
    return JSON.stringify({
      command: command.trim(),
      args: argsText
        .split(/\r?\n|,/)
        .map((value) => value.trim())
        .filter(Boolean),
      env,
    });
  }, [argsText, command, envText, transport, url]);

  function resetForm() {
    setName('');
    setTransport('stdio');
    setCommand('');
    setArgsText('');
    setEnvText('{}');
    setUrl('');
    testConnection.reset();
    addMcpServer.reset();
  }

  function canSubmit(): boolean {
    if (!companyId) return false;
    if (!name.trim()) return false;
    if (transport === 'sse') return url.trim().length > 0;
    return command.trim().length > 0;
  }

  async function handleTest() {
    if (!canSubmit()) return;
    try {
      await testConnection.mutateAsync({
        transport,
        configJson,
      });
    } catch {
      // Mutation state drives the inline error copy.
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit()) return;
    try {
      await addMcpServer.mutateAsync({
        companyId,
        name: name.trim(),
        transport,
        configJson,
      });
      resetForm();
      onOpenChange(false);
    } catch {
      // Mutation state drives the inline error copy.
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) resetForm();
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import MCP</DialogTitle>
          <DialogDescription>
            Register a workspace-scoped MCP server over stdio or SSE.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="mcp-name" className="text-xs font-medium text-muted-foreground">
              Server Name
            </label>
            <Input
              id="mcp-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Filesystem MCP"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="mcp-transport" className="text-xs font-medium text-muted-foreground">
              Transport
            </label>
            <select
              id="mcp-transport"
              value={transport}
              onChange={(event) => setTransport(event.target.value as 'stdio' | 'sse')}
              className={selectClass}
            >
              <option value="stdio">stdio</option>
              <option value="sse">sse</option>
            </select>
          </div>

          {transport === 'stdio' ? (
            <>
              <div className="space-y-1.5">
                <label htmlFor="mcp-command" className="text-xs font-medium text-muted-foreground">
                  Command
                </label>
                <Input
                  id="mcp-command"
                  value={command}
                  onChange={(event) => setCommand(event.target.value)}
                  placeholder="npx"
                  className="font-mono text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="mcp-args" className="text-xs font-medium text-muted-foreground">
                  Args
                </label>
                <Textarea
                  id="mcp-args"
                  value={argsText}
                  onChange={(event) => setArgsText(event.target.value)}
                  placeholder="-y,@modelcontextprotocol/server-filesystem,C:\\Projects"
                  className="min-h-20 font-mono text-sm"
                />
                <p className="text-[11px] text-muted-foreground">
                  Enter one arg per line or use commas.
                </p>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="mcp-env" className="text-xs font-medium text-muted-foreground">
                  Environment JSON
                </label>
                <Textarea
                  id="mcp-env"
                  value={envText}
                  onChange={(event) => setEnvText(event.target.value)}
                  className="min-h-24 font-mono text-sm"
                />
              </div>
            </>
          ) : (
            <div className="space-y-1.5">
              <label htmlFor="mcp-url" className="text-xs font-medium text-muted-foreground">
                SSE URL
              </label>
              <Input
                id="mcp-url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://example.com/sse"
                className="font-mono text-sm"
              />
            </div>
          )}

          {testConnection.isSuccess && testConnection.data.ok && (
            <p className="text-xs text-emerald-600">
              Connection ok. Detected {testConnection.data.toolCount ?? 0} tool(s).
            </p>
          )}
          {testConnection.isError && (
            <p className="text-xs text-destructive">
              Failed to test MCP connection.
            </p>
          )}
          {testConnection.isSuccess && testConnection.data.ok === false && (
            <p className="text-xs text-destructive">
              {testConnection.data.error ?? 'MCP connection test failed.'}
            </p>
          )}
          {addMcpServer.isError && (
            <p className="text-xs text-destructive">
              Failed to import the MCP server. Check the transport settings and try again.
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleTest}
              disabled={!canSubmit() || testConnection.isPending || addMcpServer.isPending}
            >
              {testConnection.isPending ? 'Testing...' : 'Test Connection'}
            </Button>
            <Button type="submit" disabled={!canSubmit() || addMcpServer.isPending}>
              {addMcpServer.isPending ? 'Importing...' : 'Import MCP'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
