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

import { Faceplate, SubviewState, Tag } from '@/components/console/index.js';
import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/input.js';
import { Switch } from '@/components/ui/switch.js';
import {
  useAuthorityGrants,
  useCreateAuthorityGrant,
  useDeleteAuthorityGrant,
} from '@/hooks/use-extensions.js';
import { ipc } from '@/lib/ipc.js';
import { cn } from '@/lib/utils.js';
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
      <div>
        <h2 className="text-h2 text-foreground">Extension Permissions</h2>
        <p className="text-body-sm text-muted-foreground mt-1">
          Configure what capabilities extensions can access. Presets provide common configurations;
          use Advanced for granular control.
        </p>
      </div>

      {!companyId ? (
        <SubviewState
          lampLabel="STBY"
          lampTone="off"
          title="Select a workspace to manage permissions."
          className="min-h-0 p-6"
        />
      ) : authorityQuery.isLoading ? (
        <SubviewState
          lampLabel="SYNC"
          lampTone="hold"
          title="Loading permissions…"
          className="min-h-0 p-6"
        />
      ) : authorityQuery.isError ? (
        <SubviewState
          lampLabel="NO-GO"
          lampTone="nogo"
          title="Failed to load permissions configuration."
          className="min-h-0 p-6"
        />
      ) : (
        <div className="space-y-4">
          {/* Preset Cards */}
          <Faceplate kicker="Authority" serial="PRESETS" bodyClassName="space-y-3">
            <div>
              <h3 className="text-h3 text-foreground">Permission Presets</h3>
              <p className="text-caption text-muted-foreground mt-0.5">
                Choose a preset to quickly configure extension permissions.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              {(Object.entries(PRESETS) as [PermissionPreset, PresetConfig][]).map(
                ([key, config]) => {
                  const isSelected = selectedPreset === key;
                  return (
                    <div
                      key={key}
                      data-testid={`preset-card-${key}`}
                      className={cn(
                        'relative rounded-lg border p-4 transition-colors',
                        isSelected
                          ? 'border-[var(--armed-edge)] bg-[var(--armed-soft)]'
                          : 'border-[var(--hairline)] bg-transparent hover:border-[var(--hairline-strong)]',
                      )}
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
                            <span className="text-eyebrow-sm text-[var(--armed)]">Active</span>
                          )}
                        </div>
                        <p className="mb-3 text-caption text-muted-foreground">
                          {config.description}
                        </p>

                        {/* Allowed Paths */}
                        {config.defaultPaths.length > 0 ? (
                          <div className="space-y-1">
                            <p className="text-eyebrow-sm text-muted-foreground">Allowed Paths:</p>
                            <div className="flex flex-wrap gap-1">
                              {config.defaultPaths.map((path) => (
                                <Tag key={path} mono>
                                  {formatPath(path)}
                                </Tag>
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
              <div className="rounded-inset border border-[var(--led-nogo-edge)] bg-[var(--warn-soft)] px-3 py-2 text-body text-[var(--led-nogo)]">
                Failed to apply permission preset.
              </div>
            )}
          </Faceplate>

          {/* Advanced Toggle */}
          <Faceplate kicker="Authority" serial="MATRIX" bodyClassName="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-h3 text-foreground">Advanced Authority Matrix</h3>
                <p className="text-caption text-muted-foreground mt-0.5">
                  View and manage all authority grants with granular control.
                </p>
              </div>
              <Switch
                checked={showAdvanced}
                onCheckedChange={setShowAdvanced}
                aria-label="Show advanced authority matrix"
              />
            </div>

            {showAdvanced && (
              <div className="space-y-4">
                {/* Add custom path section */}
                <div className="space-y-2">
                  <p className="text-label text-muted-foreground">Add Custom Path</p>
                  <p className="text-caption text-muted-foreground">
                    Grant extensions access to specific filesystem paths. Use templates like{' '}
                    <code className="rounded bg-[var(--void)] px-1 py-0.5 text-[var(--display-fg)]">
                      {'{{documents}}'}
                    </code>{' '}
                    or browse to select a directory.
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
                    <p className="text-caption text-[var(--led-nogo)]">
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
                    <div className="rounded-inset border border-dashed border-[var(--hairline)] px-3 py-6 text-center">
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
                          className="flex items-center justify-between rounded-inset border border-[var(--hairline)] px-3 py-2"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-body-strong truncate">
                                {formatPath(grant.resourceId)}
                              </span>
                              <Tag mono>{grant.resourceKind}</Tag>
                              <Tag>{formatPermission(grant.permission)}</Tag>
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
              </div>
            )}
          </Faceplate>
        </div>
      )}
    </section>
  );
}
