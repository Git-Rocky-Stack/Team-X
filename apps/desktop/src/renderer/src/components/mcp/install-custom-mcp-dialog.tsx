/**
 * Install Custom MCP Dialog - Improved MCP server installation with validation
 *
 * Simplifies the complex MCP configuration process into a guided experience
 * with validation, testing, and clear feedback.
 */

import { AlertCircle, Check, Globe, Loader2, Play, Server, Zap } from 'lucide-react';
import { useState } from 'react';

import { Alert, AlertDescription } from '@/components/ui/alert.js';
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
import { Label } from '@/components/ui/label.js';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select.js';
import { Textarea } from '@/components/ui/textarea.js';

interface ConnectionTestResult {
  ok: boolean;
  toolCount?: number;
  error?: string;
}

interface InstallCustomMcpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInstall: (config: {
    name: string;
    transport: 'stdio' | 'sse';
    command: string;
    args: string[];
    env?: Record<string, string>;
    url?: string;
  }) => Promise<void>;
  onTest?: (config: {
    transport: 'stdio' | 'sse';
    command: string;
    args: string[];
    env?: Record<string, string>;
    url?: string;
  }) => Promise<ConnectionTestResult>;
  isInstalling?: boolean;
  isTesting?: boolean;
}

type TransportType = 'stdio' | 'sse';

export function InstallCustomMcpDialog({
  open,
  onOpenChange,
  onInstall,
  onTest,
  isInstalling = false,
  isTesting = false,
}: InstallCustomMcpDialogProps) {
  const [transport, setTransport] = useState<TransportType>('stdio');
  const [name, setName] = useState('');
  const [command, setCommand] = useState('npx');
  const [argsText, setArgsText] = useState('');
  const [envText, setEnvText] = useState('{}');
  const [url, setUrl] = useState('');
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function resetForm() {
    setTransport('stdio');
    setName('');
    setCommand('npx');
    setArgsText('');
    setEnvText('{}');
    setUrl('');
    setTestResult(null);
    setError(null);
  }

  function handleClose() {
    resetForm();
    onOpenChange(false);
  }

  function getConfig() {
    const env: Record<string, string> | undefined = (() => {
      try {
        const parsed = JSON.parse(envText.trim() || '{}');
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return Object.fromEntries(
            Object.entries(parsed).filter(
              (entry): entry is [string, string] =>
                typeof entry[0] === 'string' && typeof entry[1] === 'string',
            ),
          );
        }
      } catch {
        // Invalid JSON
      }
      return undefined;
    })();

    const args = argsText
      .split(/\r?\n|,/)
      .map((value) => value.trim())
      .filter(Boolean);

    return {
      transport,
      command: command.trim(),
      args,
      env,
      url: transport === 'sse' ? url.trim() : undefined,
    };
  }

  async function handleTest() {
    if (!onTest) return;

    const config = getConfig();
    setError(null);
    setTestResult(null);

    try {
      const result = await onTest(config);
      setTestResult(result);
      if (!result.ok) {
        setError(result.error || 'Connection test failed');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Connection test failed';
      setError(errorMessage);
      setTestResult({ ok: false, error: errorMessage });
    }
  }

  async function handleSubmit() {
    if (!name.trim()) {
      setError('Please enter a name for this MCP server');
      return;
    }

    const config = getConfig();
    setError(null);

    try {
      await onInstall({
        name: name.trim(),
        ...config,
      });
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Installation failed');
    }
  }

  function canSubmit(): boolean {
    if (!name.trim()) return false;
    if (transport === 'sse') return url.trim().length > 0;
    return command.trim().length > 0;
  }

  const canTest = onTest && canSubmit();

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Server className="h-5 w-5 text-blue-500" />
            Install Custom MCP Server
          </DialogTitle>
          <DialogDescription>
            Add a custom MCP server for advanced integrations and external services
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Basic configuration */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="mcp-name">Server Name</Label>
              <Input
                id="mcp-name"
                placeholder="My Custom MCP"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isInstalling}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="mcp-transport">Transport Type</Label>
              <Select
                value={transport}
                onValueChange={(value) => setTransport(value as TransportType)}
              >
                <SelectTrigger id="mcp-transport">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="stdio">
                    <div className="flex items-center gap-2">
                      <Server className="h-4 w-4" />
                      <div>
                        <div className="font-medium">stdio</div>
                        <div className="text-caption text-muted-foreground">
                          Standard input/output (recommended)
                        </div>
                      </div>
                    </div>
                  </SelectItem>
                  <SelectItem value="sse">
                    <div className="flex items-center gap-2">
                      <Globe className="h-4 w-4" />
                      <div>
                        <div className="font-medium">SSE</div>
                        <div className="text-caption text-muted-foreground">
                          Server-Sent Events (HTTP-based)
                        </div>
                      </div>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Transport-specific configuration */}
          {transport === 'stdio' ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="mcp-command">Command</Label>
                <Input
                  id="mcp-command"
                  placeholder="npx"
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  className="text-code"
                  disabled={isInstalling}
                />
                <p className="text-caption text-muted-foreground">
                  The command to run (usually &apos;npx&apos; for Node.js packages)
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="mcp-args">Arguments</Label>
                <Textarea
                  id="mcp-args"
                  placeholder="-y,@modelcontextprotocol/server-filesystem,C:\AllowedPath"
                  value={argsText}
                  onChange={(e) => setArgsText(e.target.value)}
                  className="min-h-20 text-code"
                  disabled={isInstalling}
                />
                <p className="text-caption text-muted-foreground">
                  Enter one argument per line or use commas
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="mcp-env">Environment Variables (JSON)</Label>
                <Textarea
                  id="mcp-env"
                  placeholder='{"API_KEY": "your-key-here"}'
                  value={envText}
                  onChange={(e) => setEnvText(e.target.value)}
                  className="min-h-24 text-code"
                  disabled={isInstalling}
                />
                <p className="text-caption text-muted-foreground">
                  Optional environment variables as JSON
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="mcp-url">SSE URL</Label>
              <Input
                id="mcp-url"
                placeholder="https://example.com/sse"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="text-code"
                disabled={isInstalling}
              />
              <p className="text-caption text-muted-foreground">
                The SSE endpoint URL for the MCP server
              </p>
            </div>
          )}

          {/* Error display */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Test result */}
          {testResult && (
            <Alert variant={testResult.ok ? 'default' : 'destructive'}>
              {testResult.ok ? (
                <>
                  <Check className="h-4 w-4" />
                  <AlertDescription>
                    Connection successful! Detected {testResult.toolCount ?? 0} tool(s).
                  </AlertDescription>
                </>
              ) : (
                <>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{testResult.error || 'Connection failed'}</AlertDescription>
                </>
              )}
            </Alert>
          )}

          {/* Preview */}
          <div className="space-y-2">
            <Label>Configuration Preview</Label>
            <div className="bg-muted/50 p-3 rounded-lg space-y-1 text-code-sm">
              <div className="text-muted-foreground"># Configuration</div>
              <div>Name: {name || '(not set)'}</div>
              <div>Transport: {transport}</div>
              {transport === 'stdio' ? (
                <>
                  <div>Command: {command || '(not set)'}</div>
                  <div>
                    Args:{' '}
                    {argsText
                      .split(/\r?\n|,/)
                      .map((s) => s.trim())
                      .filter(Boolean)
                      .join(' ') || '(none)'}
                  </div>
                  {envText && envText !== '{}' && <div>Env: {envText}</div>}
                </>
              ) : (
                <div>URL: {url || '(not set)'}</div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <DialogFooter className="gap-2">
          <Button type="button" variant="ghost" onClick={handleClose} disabled={isInstalling}>
            Cancel
          </Button>
          {canTest && (
            <Button
              type="button"
              variant="outline"
              onClick={handleTest}
              disabled={!canSubmit() || isTesting || isInstalling}
              className="gap-2"
            >
              {isTesting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Testing...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  Test Connection
                </>
              )}
            </Button>
          )}
          <Button onClick={handleSubmit} disabled={!canSubmit() || isInstalling} className="gap-2">
            {isInstalling ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Installing...
              </>
            ) : (
              <>
                <Zap className="h-4 w-4" />
                Install MCP Server
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
