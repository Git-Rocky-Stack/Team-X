import { useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge.js';
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
import {
  useAddMcpServer,
  useInstallMcpTemplate,
  useMcpTemplates,
  useTestMcpConnection,
} from '@/hooks/use-extensions.js';
import { requireString } from '@/lib/required.js';

interface ImportMcpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string | null;
}

const selectClass =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-body ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

type ImportMode = 'template' | 'manual';

export function ImportMcpDialog({ open, onOpenChange, companyId }: ImportMcpDialogProps) {
  const templatesQuery = useMcpTemplates(companyId);
  const addMcpServer = useAddMcpServer(companyId);
  const installTemplate = useInstallMcpTemplate(companyId);
  const testConnection = useTestMcpConnection();
  const [mode, setMode] = useState<ImportMode>('template');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [name, setName] = useState('');
  const [transport, setTransport] = useState<'stdio' | 'sse'>('stdio');
  const [command, setCommand] = useState('');
  const [argsText, setArgsText] = useState('');
  const [envText, setEnvText] = useState('{}');
  const [url, setUrl] = useState('');

  const templates = templatesQuery.data ?? [];
  const selectedTemplate =
    templates.find((template) => template.id === selectedTemplateId) ?? templates[0] ?? null;

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
    setMode('template');
    setSelectedTemplateId('');
    setName('');
    setTransport('stdio');
    setCommand('');
    setArgsText('');
    setEnvText('{}');
    setUrl('');
    testConnection.reset();
    addMcpServer.reset();
    installTemplate.reset();
  }

  function canSubmit(): boolean {
    if (!companyId) return false;
    if (mode === 'template') {
      return Boolean(selectedTemplate && !selectedTemplate.installed);
    }
    if (!name.trim()) return false;
    if (transport === 'sse') return url.trim().length > 0;
    return command.trim().length > 0;
  }

  async function handleTest() {
    if (!canSubmit() || mode !== 'manual') return;
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
    const requiredCompanyId = requireString(companyId, 'companyId');
    try {
      if (mode === 'template' && selectedTemplate) {
        await installTemplate.mutateAsync({
          companyId: requiredCompanyId,
          templateId: selectedTemplate.id,
        });
      } else {
        await addMcpServer.mutateAsync({
          companyId: requiredCompanyId,
          name: name.trim(),
          transport,
          configJson,
        });
      }
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
            Install a built-in MCP template or register a workspace-scoped stdio/SSE server.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="mcp-import-mode" className="text-label text-muted-foreground">
              Source
            </label>
            <select
              id="mcp-import-mode"
              value={mode}
              onChange={(event) => setMode(event.target.value as ImportMode)}
              className={selectClass}
            >
              <option value="template">Built-in Template</option>
              <option value="manual">Manual Entry</option>
            </select>
          </div>

          {mode === 'template' ? (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="mcp-template" className="text-label text-muted-foreground">
                  Template
                </label>
                <select
                  id="mcp-template"
                  value={selectedTemplate?.id ?? ''}
                  onChange={(event) => setSelectedTemplateId(event.target.value)}
                  className={selectClass}
                  disabled={templatesQuery.isLoading || templates.length === 0}
                >
                  {templates.length === 0 ? (
                    <option value="">No templates available</option>
                  ) : (
                    templates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name} ({template.transport})
                      </option>
                    ))
                  )}
                </select>
              </div>

              {templatesQuery.isLoading ? (
                <p className="text-body text-muted-foreground">Loading built-in templates...</p>
              ) : templatesQuery.isError ? (
                <p className="text-body text-destructive">Failed to load built-in MCP templates.</p>
              ) : selectedTemplate ? (
                <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-body-strong text-foreground">
                        {selectedTemplate.name}
                      </div>
                      <div className="text-body-sm text-muted-foreground">
                        {selectedTemplate.sourceRef}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{selectedTemplate.transport}</Badge>
                      {selectedTemplate.installed && <Badge variant="secondary">Installed</Badge>}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-caption text-muted-foreground">
                    <span>{selectedTemplate.requestedCapabilities.length} capabilities</span>
                    <span>{selectedTemplate.lastHealth ?? 'not yet connected'}</span>
                  </div>
                  <p className="mt-3 text-caption text-muted-foreground">
                    Built-in templates are copied into the current workspace as real MCP rows, so
                    you can enable, disable, and remove them independently afterward.
                  </p>
                </div>
              ) : (
                <p className="text-body text-muted-foreground">
                  Choose a built-in template to review its runtime shape before installing it.
                </p>
              )}
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <label htmlFor="mcp-name" className="text-label text-muted-foreground">
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
                <label htmlFor="mcp-transport" className="text-label text-muted-foreground">
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
                    <label htmlFor="mcp-command" className="text-label text-muted-foreground">
                      Command
                    </label>
                    <Input
                      id="mcp-command"
                      value={command}
                      onChange={(event) => setCommand(event.target.value)}
                      placeholder="npx"
                      className="text-code"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="mcp-args" className="text-label text-muted-foreground">
                      Args
                    </label>
                    <Textarea
                      id="mcp-args"
                      value={argsText}
                      onChange={(event) => setArgsText(event.target.value)}
                      placeholder="-y,@modelcontextprotocol/server-filesystem,C:\\Projects"
                      className="min-h-20 text-code"
                    />
                    <p className="text-caption text-muted-foreground">
                      Enter one arg per line or use commas.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="mcp-env" className="text-label text-muted-foreground">
                      Environment JSON
                    </label>
                    <Textarea
                      id="mcp-env"
                      value={envText}
                      onChange={(event) => setEnvText(event.target.value)}
                      className="min-h-24 text-code"
                    />
                  </div>
                </>
              ) : (
                <div className="space-y-1.5">
                  <label htmlFor="mcp-url" className="text-label text-muted-foreground">
                    SSE URL
                  </label>
                  <Input
                    id="mcp-url"
                    value={url}
                    onChange={(event) => setUrl(event.target.value)}
                    placeholder="https://example.com/sse"
                    className="text-code"
                  />
                </div>
              )}
            </>
          )}

          {mode === 'manual' && testConnection.isSuccess && testConnection.data.ok && (
            <p className="text-body text-emerald-600">
              Connection ok. Detected {testConnection.data.toolCount ?? 0} tool(s).
            </p>
          )}
          {mode === 'manual' && testConnection.isError && (
            <p className="text-body text-destructive">Failed to test MCP connection.</p>
          )}
          {mode === 'manual' && testConnection.isSuccess && testConnection.data.ok === false && (
            <p className="text-body text-destructive">
              {testConnection.data.error ?? 'MCP connection test failed.'}
            </p>
          )}
          {mode === 'template' && selectedTemplate?.installed && (
            <p className="text-body text-muted-foreground">
              This template is already installed in the current workspace.
            </p>
          )}
          {mode === 'manual' && addMcpServer.isError && (
            <p className="text-body text-destructive">
              Failed to import the MCP server. Check the transport settings and try again.
            </p>
          )}
          {mode === 'template' && installTemplate.isError && (
            <p className="text-body text-destructive">
              Failed to install the selected template into this workspace.
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            {mode === 'manual' && (
              <Button
                type="button"
                variant="outline"
                onClick={handleTest}
                disabled={!canSubmit() || testConnection.isPending || addMcpServer.isPending}
              >
                {testConnection.isPending ? 'Testing...' : 'Test Connection'}
              </Button>
            )}
            <Button
              type="submit"
              disabled={
                !canSubmit() ||
                addMcpServer.isPending ||
                installTemplate.isPending ||
                templatesQuery.isLoading
              }
            >
              {mode === 'template'
                ? installTemplate.isPending
                  ? 'Installing...'
                  : selectedTemplate?.installed
                    ? 'Installed'
                    : 'Install Template'
                : addMcpServer.isPending
                  ? 'Importing...'
                  : 'Import MCP'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
