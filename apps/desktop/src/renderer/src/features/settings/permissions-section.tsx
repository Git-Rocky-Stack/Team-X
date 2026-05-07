/**
 * PermissionsSection — simplified permissions UX with preset cards.
 *
 * Provides three permission presets for managing extension authority:
 * - safe: read-only access to documents, vault search
 * - standard: full filesystem access in allowed folders, shell commands
 * - advanced: all capabilities, custom paths, full control
 *
 * An "Advanced" toggle reveals the full authority matrix for granular control.
 *
 * Phase 6 — Proactive Execution System — Slice 5
 */

import { useState } from 'react';

import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.js';
import { Input } from '@/components/ui/input.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { Switch } from '@/components/ui/switch.js';
import {
  useAuthorityGrants,
  useCreateAuthorityGrant,
  useDeleteAuthorityGrant,
} from '@/hooks/use-extensions.js';
import { ipc } from '@/lib/ipc.js';
import { useAppStore } from '@/store/app-store.js';

type PermissionPreset = 'safe' | 'standard' | 'advanced';

const PERMISSION_LABEL: Record<string, string> = {
  allow: 'Allow',
  deny: 'Deny',
  prompt: 'Prompt',
};

function formatPermission(permission: string): string {
  return PERMISSION_LABEL[permission] ?? permission;
}

interface PresetConfig {
  label: string;
  description: string;
  capabilities: string[];
  defaultPaths: string[];
}

const PRESETS: Record<PermissionPreset, PresetConfig> = {
  safe: {
    label: 'Safe Mode',
    description: 'Read-only access to documents. No shell, no network writes.',
    capabilities: ['filesystem.read', 'vault.search'],
    defaultPaths: ['{{documents}}'],
  },
  standard: {
    label: 'Standard',
    description: 'Full filesystem access in allowed folders. Shell commands.',
    capabilities: ['filesystem.read', 'filesystem.write', 'shell', 'vault.search'],
    defaultPaths: ['{{documents}}', '{{desktop}}', '{{downloads}}'],
  },
  advanced: {
    label: 'Advanced',
    description: 'All capabilities. Custom paths. Full control.',
    capabilities: ['*'],
    defaultPaths: [],
  },
};

function formatPath(path: string): string {
  if (path === '{{documents}}') return 'Documents';
  if (path === '{{desktop}}') return 'Desktop';
  if (path === '{{downloads}}') return 'Downloads';
  return path;
}

export function PermissionsSection() {
  const companyId = useAppStore((state) => state.companyId);
  const authorityQuery = useAuthorityGrants(companyId);
  const createGrant = useCreateAuthorityGrant();
  const deleteGrant = useDeleteAuthorityGrant(companyId);

  const [selectedPreset, setSelectedPreset] = useState<PermissionPreset>('standard');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [newPathInput, setNewPathInput] = useState('');
  const [isAddingPath, setIsAddingPath] = useState(false);

  const authorityGrants = authorityQuery.data ?? [];
  const employeeGrants = authorityGrants.filter((g) => g.scopeKind === 'employee');

  async function applyPreset(preset: PermissionPreset) {
    if (!companyId) return;
    setIsApplying(true);

    try {
      // Remove existing employee grants for this company
      for (const grant of employeeGrants) {
        await deleteGrant.mutateAsync(grant.id);
      }

      // Apply new preset grants
      const config = PRESETS[preset];

      // Add capability grants
      for (const capability of config.capabilities) {
        await createGrant.mutateAsync({
          companyId,
          scopeKind: 'company',
          scopeId: companyId,
          resourceKind: 'capability',
          resourceId: capability,
          permission: 'allow',
        });
      }

      // Add path grants
      for (const path of config.defaultPaths) {
        await createGrant.mutateAsync({
          companyId,
          scopeKind: 'company',
          scopeId: companyId,
          resourceKind: 'path',
          resourceId: path,
          permission: 'allow',
        });
      }

      setSelectedPreset(preset);
    } catch (err) {
      console.error('[permissions] Failed to apply preset:', err);
    } finally {
      setIsApplying(false);
    }
  }

  async function addCustomPath(path: string) {
    if (!companyId) return;
    setIsAddingPath(true);
    try {
      await createGrant.mutateAsync({
        companyId,
        scopeKind: 'company',
        scopeId: companyId,
        resourceKind: 'path',
        resourceId: path,
        permission: 'allow',
      });
      setNewPathInput('');
    } catch (err) {
      console.error('[permissions] Failed to add custom path:', err);
    } finally {
      setIsAddingPath(false);
    }
  }

  async function handleSelectDirectory() {
    if (!companyId) return;
    try {
      const result = await ipc.system.selectDirectory();
      if (result.canceled || !result.folderPath) return;
      setNewPathInput(result.folderPath);
    } catch (err) {
      console.error('[permissions] Failed to select directory:', err);
    }
  }

  return (
    <section className="space-y-4" data-permissions-section="">
      <h2 className="text-h2 text-foreground">Extension Permissions</h2>
      <p className="text-body-sm text-muted-foreground mt-1">
        Configure what capabilities extensions can access. Presets provide common configurations;
        use Advanced for granular control.
      </p>

      {!companyId ? (
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <p className="text-body text-muted-foreground">
              Select a workspace to manage permissions.
            </p>
          </CardContent>
        </Card>
      ) : authorityQuery.isLoading ? (
        <Card>
          <CardContent className="py-6">
            <div className="space-y-3">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          </CardContent>
        </Card>
      ) : authorityQuery.isError ? (
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <p className="text-body text-destructive">Failed to load permissions configuration.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {/* Preset Cards */}
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-h3">Permission Presets</CardTitle>
              <CardDescription>
                Choose a preset to quickly configure extension permissions.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 md:grid-cols-3">
                {(Object.entries(PRESETS) as [PermissionPreset, PresetConfig][]).map(
                  ([key, config]) => {
                    const isSelected = selectedPreset === key;
                    return (
                      <div
                        key={key}
                        data-testid={`preset-card-${key}`}
                        className={`relative rounded-lg border-2 p-4 ${
                          isSelected
                            ? 'brand-selected'
                            : 'border-border/70 bg-muted/20 hover:border-border transition-colors'
                        }`}
                      >
                        <input
                          type="radio"
                          name="preset"
                          id={`preset-${key}`}
                          aria-label={`${key}-preset`}
                          checked={isSelected}
                          onChange={() => void applyPreset(key)}
                          disabled={isApplying || !companyId}
                          className="sr-only"
                        />
                        <label
                          htmlFor={`preset-${key}`}
                          className={`block cursor-pointer ${isApplying ? 'opacity-50' : ''}`}
                        >
                          <div className="mb-2 flex items-center justify-between">
                            <span className="text-body-strong capitalize">{config.label}</span>
                            {isSelected && (
                              <Badge variant="default" className="text-[10px]">
                                Active
                              </Badge>
                            )}
                          </div>
                          <p className="mb-3 text-caption text-muted-foreground">
                            {config.description}
                          </p>

                          {/* Allowed Paths */}
                          {config.defaultPaths.length > 0 ? (
                            <div className="space-y-1">
                              <p className="text-eyebrow-sm text-muted-foreground">
                                Allowed Paths:
                              </p>
                              <div className="flex flex-wrap gap-1">
                                {config.defaultPaths.map((path) => (
                                  <span
                                    key={path}
                                    className="rounded bg-muted px-1.5 py-0.5 text-code-sm"
                                  >
                                    {formatPath(path)}
                                  </span>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <p className="text-caption text-muted-foreground">
                              User-defined paths only
                            </p>
                          )}
                        </label>
                      </div>
                    );
                  },
                )}
              </div>

              {createGrant.isError && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-body text-destructive">
                  Failed to apply permission preset.
                </div>
              )}
            </CardContent>
          </Card>

          {/* Advanced Toggle */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-h3">Advanced Authority Matrix</CardTitle>
                  <CardDescription>
                    View and manage all authority grants with granular control.
                  </CardDescription>
                </div>
                <Switch
                  checked={showAdvanced}
                  onCheckedChange={setShowAdvanced}
                  aria-label="Show advanced authority matrix"
                />
              </div>
            </CardHeader>

            {showAdvanced && (
              <CardContent className="space-y-4">
                {/* Add custom path section */}
                <div className="space-y-2">
                  <p className="text-label text-muted-foreground">Add Custom Path</p>
                  <p className="text-caption text-muted-foreground">
                    Grant extensions access to specific filesystem paths. Use templates like{' '}
                    <code className="rounded bg-muted px-1 py-0.5">{'{{documents}}'}</code> or
                    browse to select a directory.
                  </p>
                  <div className="flex gap-2">
                    <Input
                      placeholder="{{documents}}, /path/to/folder, or browse..."
                      value={newPathInput}
                      onChange={(e) => setNewPathInput(e.target.value)}
                      disabled={isAddingPath || !companyId}
                      className="h-9 text-body"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && newPathInput.trim()) {
                          e.preventDefault();
                          addCustomPath(newPathInput.trim());
                        }
                      }}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleSelectDirectory}
                      disabled={isAddingPath || !companyId}
                      className="h-9 px-3"
                      title="Browse for directory"
                    >
                      Browse
                    </Button>
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => newPathInput.trim() && addCustomPath(newPathInput.trim())}
                      disabled={isAddingPath || !companyId || !newPathInput.trim()}
                      className="h-9"
                    >
                      {isAddingPath ? 'Adding...' : 'Add'}
                    </Button>
                  </div>
                  {createGrant.isError && (
                    <p className="text-caption text-destructive">
                      Failed to add path. Please try again.
                    </p>
                  )}
                </div>

                {/* Existing grants list */}
                <div className="space-y-2">
                  <p className="text-label text-muted-foreground">
                    Existing Grants ({employeeGrants.length})
                  </p>
                  {employeeGrants.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border/70 px-3 py-6 text-center">
                      <p className="text-body text-muted-foreground">
                        No custom authority grants configured. Use presets above for quick setup or
                        add custom paths.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {employeeGrants.map((grant) => (
                        <div
                          key={grant.id}
                          className="flex items-center justify-between rounded-lg border border-border/70 bg-muted/20 px-3 py-2"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-body-strong truncate">
                                {formatPath(grant.resourceId)}
                              </span>
                              <Badge variant="outline">{grant.resourceKind}</Badge>
                              <Badge variant="secondary">{formatPermission(grant.permission)}</Badge>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-button-sm"
                            onClick={() => deleteGrant.mutate(grant.id)}
                            disabled={deleteGrant.isPending}
                          >
                            Remove
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            )}
          </Card>
        </div>
      )}
    </section>
  );
}
