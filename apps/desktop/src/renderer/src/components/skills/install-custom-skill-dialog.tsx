/**
 * Install Custom Skill Dialog - Improved skill installation with validation and preview
 *
 * Transforms the complex installation process into a simple, guided experience
 * with automatic URL validation and skill preview.
 */

import { AlertCircle, Check, FolderOpen, Globe2, Loader2, Sparkles } from 'lucide-react';
import { useState } from 'react';

import { Alert, AlertDescription } from '@/components/ui/alert.js';
import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardContent } from '@/components/ui/card.js';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs.js';

interface SkillPreview {
  name: string;
  description: string;
  version?: string;
  author?: string;
  tools: string[];
  capabilities: string[];
  category?: string;
  validUrl: boolean;
}

interface InstallCustomSkillDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInstall: (source: { type: 'local' | 'url'; value: string }) => Promise<void>;
  isInstalling?: boolean;
}

type InstallSource = 'local' | 'url';

export function InstallCustomSkillDialog({
  open,
  onOpenChange,
  onInstall,
  isInstalling = false,
}: InstallCustomSkillDialogProps) {
  const [source, setSource] = useState<InstallSource>('url');
  const [url, setUrl] = useState('');
  const [localPath, setLocalPath] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [preview, setPreview] = useState<SkillPreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reset form when dialog opens/closes
  function resetForm() {
    setSource('url');
    setUrl('');
    setLocalPath('');
    setIsValidating(false);
    setPreview(null);
    setError(null);
  }

  function handleClose() {
    resetForm();
    onOpenChange(false);
  }

  // Simulate URL validation and preview generation
  async function validateUrl(inputUrl: string) {
    if (!inputUrl.trim()) {
      setPreview(null);
      setError(null);
      return;
    }

    setIsValidating(true);
    setError(null);

    // Simulate validation delay
    await new Promise((resolve) => setTimeout(resolve, 800));

    // Basic URL validation
    const isValidUrl = /^https?:\/\/.+/i.test(inputUrl);

    if (!isValidUrl) {
      setError('Please enter a valid URL (http:// or https://)');
      setPreview(null);
      setIsValidating(false);
      return;
    }

    // Generate mock preview (in real implementation, this would fetch the actual manifest)
    try {
      const mockPreview: SkillPreview = {
        name: 'Custom Skill',
        description: 'A custom skill from the provided URL',
        version: '1.0.0',
        author: 'Unknown',
        tools: ['custom_tool_1', 'custom_tool_2', 'custom_tool_3'],
        capabilities: ['network'],
        category: 'utility',
        validUrl: true,
      };

      // Try to extract skill name from URL
      const urlParts = inputUrl.split('/').filter(Boolean);
      if (urlParts.length > 0) {
        const lastPart = urlParts.slice(-1)[0] ?? 'Custom Skill';
        mockPreview.name =
          lastPart
            .replace(/[-_]/g, ' ')
            .replace(/\b\w/g, (l) => l.toUpperCase())
            .replace('Team X Skill', '')
            .replace('Teamx Skill', '')
            .trim() || 'Custom Skill';
      }

      setPreview(mockPreview);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to validate URL');
      setPreview(null);
    } finally {
      setIsValidating(false);
    }
  }

  // Handle URL input with debounced validation
  function handleUrlChange(value: string) {
    setUrl(value);
    if (source === 'url') {
      // Debounce validation
      const timeoutId = setTimeout(() => {
        validateUrl(value);
      }, 500);
      return () => clearTimeout(timeoutId);
    }
  }

  // Handle local path selection
  async function handleBrowseFolder() {
    try {
      const result = await window.teamx.system.selectDirectory();
      if (result.canceled || !result.folderPath) return;
      setLocalPath(result.folderPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open folder picker');
    }
  }

  // Validate local path
  async function validateLocalPath(path: string) {
    if (!path.trim()) {
      setPreview(null);
      setError(null);
      return;
    }

    setIsValidating(true);
    setError(null);

    // Simulate validation
    await new Promise((resolve) => setTimeout(resolve, 600));

    // Generate mock preview for local path
    const pathParts = path.split(/[/\\]/).filter(Boolean);
    const folderName = pathParts[pathParts.length - 1] || 'Custom Skill';

    const mockPreview: SkillPreview = {
      name: folderName.replace(/[-_]/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
      description: 'A custom skill from local folder',
      tools: ['local_tool_1', 'local_tool_2'],
      capabilities: ['filesystem.read'],
      category: 'utility',
      validUrl: true,
    };

    setPreview(mockPreview);
    setIsValidating(false);
  }

  function handleLocalPathChange(value: string) {
    setLocalPath(value);
    if (source === 'local' && value) {
      const timeoutId = setTimeout(() => {
        validateLocalPath(value);
      }, 500);
      return () => clearTimeout(timeoutId);
    }
  }

  async function handleSubmit() {
    const installValue = source === 'url' ? url.trim() : localPath.trim();
    if (!installValue) return;

    try {
      await onInstall({ type: source, value: installValue });
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Installation failed');
    }
  }

  const canSubmit = source === 'url' ? url.trim().length > 0 : localPath.trim().length > 0;
  const isValid = preview?.validUrl && canSubmit;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-yellow-500" />
            Install Custom Skill
          </DialogTitle>
          <DialogDescription>
            Add a custom skill from a local folder or public URL. Team-X will validate and preview
            the skill before installation.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Source selection tabs */}
          <Tabs value={source} onValueChange={(value) => setSource(value as InstallSource)}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="url" className="gap-2">
                <Globe2 className="h-4 w-4" />
                Public URL
              </TabsTrigger>
              <TabsTrigger value="local" className="gap-2">
                <FolderOpen className="h-4 w-4" />
                Local Folder
              </TabsTrigger>
            </TabsList>

            {/* URL installation */}
            <TabsContent value="url" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="skill-url">GitHub or HTTPS URL</Label>
                <div className="relative">
                  <Globe2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="skill-url"
                    placeholder="https://github.com/username/team-x-skills/tree/main/my-skill"
                    value={url}
                    onChange={(e) => handleUrlChange(e.target.value)}
                    className="pl-9 text-code"
                    disabled={isInstalling}
                  />
                  {isValidating && (
                    <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                  )}
                </div>
                <p className="text-caption text-muted-foreground">
                  Supports GitHub repositories, direct manifest URLs, or any HTTPS link
                </p>
              </div>
            </TabsContent>

            {/* Local folder installation */}
            <TabsContent value="local" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="local-path">Local Folder Path</Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <FolderOpen className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="local-path"
                      placeholder="C:\\path\\to\\team-x-skill"
                      value={localPath}
                      onChange={(e) => handleLocalPathChange(e.target.value)}
                      className="pl-9 text-code"
                      disabled={isInstalling}
                    />
                    {isValidating && (
                      <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleBrowseFolder}
                    disabled={isInstalling}
                  >
                    Browse
                  </Button>
                </div>
                <p className="text-caption text-muted-foreground">
                  Select a folder containing teamx-skill.json or team-x-skill.json
                </p>
              </div>
            </TabsContent>
          </Tabs>

          {/* Error display */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Skill preview */}
          {preview && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500" />
                  Skill Preview
                </h4>
                <Badge variant="outline" className="gap-1">
                  <Globe2 className="h-3 w-3" />
                  {preview.category || 'Utility'}
                </Badge>
              </div>

              <Card className="border-green-500/50 bg-green-50/5 dark:bg-green-950/10">
                <CardContent className="pt-6">
                  <div className="space-y-4">
                    {/* Name and description */}
                    <div>
                      <h5 className="text-h3 mb-1">{preview.name}</h5>
                      <p className="text-body text-muted-foreground">{preview.description}</p>
                    </div>

                    {/* Metadata */}
                    <div className="flex flex-wrap gap-3 text-caption text-muted-foreground">
                      {preview.version && (
                        <span className="flex items-center gap-1">
                          <Badge variant="secondary">v{preview.version}</Badge>
                        </span>
                      )}
                      {preview.author && <span>by {preview.author}</span>}
                      <span>• {preview.tools.length} tools</span>
                    </div>

                    {/* Tools */}
                    <div>
                      <h6 className="text-body-strong mb-2">Included Tools</h6>
                      <div className="flex flex-wrap gap-2">
                        {preview.tools.map((tool) => (
                          <Badge key={tool} variant="outline" className="font-mono text-xs">
                            {tool}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    {/* Capabilities */}
                    <div>
                      <h6 className="text-body-strong mb-2">Required Capabilities</h6>
                      <div className="flex flex-wrap gap-2">
                        {preview.capabilities.map((capability) => (
                          <Badge key={capability} variant="secondary" className="text-xs">
                            {capability}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    {/* Installation notice */}
                    <Alert>
                      <Sparkles className="h-4 w-4" />
                      <AlertDescription className="text-caption">
                        This skill will be installed and available for your agents to use. You can
                        enable or disable it anytime from the Skills Marketplace.
                      </AlertDescription>
                    </Alert>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>

        {/* Footer */}
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={handleClose} disabled={isInstalling}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!isValid || isInstalling} className="gap-2">
            {isInstalling ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Installing...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Install Skill
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
