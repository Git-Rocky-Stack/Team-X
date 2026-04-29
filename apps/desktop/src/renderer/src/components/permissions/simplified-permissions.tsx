/**
 * Simplified Permissions - User-friendly permission management
 *
 * Replaces complex permission matrices with safety-first presets
 * that work for 90% of users while keeping advanced options accessible.
 */

import { useState } from 'react';
import { AlertTriangle, Check, ChevronDown, FolderOpen, Info, Shield, Settings2 } from 'lucide-react';

import { Alert, AlertDescription } from '@/components/ui/alert.js';
import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.js';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible.js';
import { Label } from '@/components/ui/label.js';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group.js';
import { Switch } from '@/components/ui/switch.js';
import {
  PERMISSION_PRESETS,
  expandPathPlaceholders,
  getUserFriendlyPathName,
  getRecommendedPreset,
  type PermissionPreset,
} from '@/data/permission-presets.js';
import { cn } from '@/lib/utils.js';

interface SimplifiedPermissionsProps {
  currentPreset: string;
  onPresetChange: (presetId: string) => void;
  showAdvanced?: boolean;
  onShowAdvancedChange?: (show: boolean) => void;
  isLoading?: boolean;
}

export function SimplifiedPermissions({
  currentPreset,
  onPresetChange,
  showAdvanced = false,
  onShowAdvancedChange,
  isLoading = false,
}: SimplifiedPermissionsProps) {
  const [expandedPreset, setExpandedPreset] = useState<string | null>(null);
  const [showWarnings, setShowWarnings] = useState(true);

  const selectedPreset = PERMISSION_PRESETS.find((p) => p.id === currentPreset) || getRecommendedPreset();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Shield className="h-5 w-5 text-green-500" />
          Agent Permissions
        </h3>
        <p className="text-sm text-muted-foreground">
          Choose how much access agents have to your system. Safe defaults are recommended for most users.
        </p>
      </div>

      {/* Permission Presets */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Permission Presets</CardTitle>
          <CardDescription>
            Choose the security level that matches your comfort level
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup value={currentPreset} onValueChange={onPresetChange}>
            <div className="space-y-3">
              {PERMISSION_PRESETS.map((preset) => {
                const isSelected = currentPreset === preset.id;
                const isExpanded = expandedPreset === preset.id;

                return (
                  <div key={preset.id} className="space-y-3">
                    {/* Preset Radio Card */}
                    <div
                      className={cn(
                        'flex items-start gap-3 p-4 rounded-lg border-2 transition-all cursor-pointer',
                        isSelected
                          ? `${preset.color === 'green' && 'border-green-500 bg-green-50/5 dark:bg-green-950/10'}`
                          : `${preset.color === 'blue' && 'border-blue-500 bg-blue-50/5 dark:bg-blue-950/10'}`
                          : `${preset.color === 'orange' && 'border-orange-500 bg-orange-50/5 dark:bg-orange-950/10'}`,
                        !isSelected && 'border-border/70 hover:border-border/70'
                      )}
                    >
                      {/* Radio Button */}
                      <RadioGroupItem
                        value={preset.id}
                        id={`preset-${preset.id}`}
                        className="mt-1"
                      />

                      {/* Preset Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <Label
                                htmlFor={`preset-${preset.id}`}
                                className={cn(
                                  'font-semibold cursor-pointer',
                                  isSelected && 'text-foreground'
                                )}
                              >
                                {preset.name}
                              </Label>
                              {preset.recommended && (
                                <Badge variant="default" className="text-xs">
                                  Recommended
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">
                              {preset.description}
                            </p>
                          </div>

                          {/* Expand/Collapse Button */}
                          {preset.warnings.length > 0 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setExpandedPreset(isExpanded ? null : preset.id)}
                              className="shrink-0"
                            >
                              {isExpanded ? (
                                <ChevronUp className="h-4 w-4" />
                              ) : (
                                <ChevronDown className="h-4 w-4" />
                              )}
                            </Button>
                          )}
                        </div>

                        {/* Capabilities Preview */}
                        <div className="mt-3 flex flex-wrap gap-2">
                          {preset.capabilities.allowed.map((cap) => (
                            <Badge key={cap} variant="default" className="text-xs">
                              <Check className="h-3 w-3 mr-1" />
                              {cap}
                            </Badge>
                          ))}
                          {preset.capabilities.denied.map((cap) => (
                            <Badge key={cap} variant="secondary" className="text-xs">
                              <EyeOff className="h-3 w-3 mr-1" />
                              {cap}
                            </Badge>
                          ))}
                        </div>

                        {/* Warnings (collapsible) */}
                        {preset.warnings.length > 0 && isExpanded && (
                          <Alert variant="warning" className="mt-3">
                            <AlertTriangle className="h-4 w-4" />
                            <AlertDescription className="text-xs">
                              <div className="font-medium mb-1">Important:</div>
                              <ul className="space-y-1">
                                {preset.warnings.map((warning, index) => (
                                  <li key={index} className="flex items-start gap-2">
                                    <span>•</span>
                                    <span>{warning}</span>
                                  </li>
                                ))}
                              </ul>
                            </AlertDescription>
                          </Alert>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </RadioGroup>
        </CardContent>
      </Card>

      {/* Detailed Permissions for Selected Preset */}
      <Card>
        <CardHeader>
          <Collapsible>
            <CollapsibleTrigger className="w-full">
              <CardTitle className="text-base flex items-center justify-between">
                <span>Permission Details</span>
                <ChevronDown className="h-4 w-4" />
              </CardTitle>
            </CollapsibleTrigger>
          </Collapsible>
          <CardDescription>
            Detailed breakdown of what agents can and cannot do
          </CardDescription>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="space-y-4">
            {/* Capabilities */}
            <div>
              <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Capabilities
              </h4>
              <div className="grid gap-3 sm:grid-cols-2">
                {/* Allowed Capabilities */}
                <div className="space-y-2">
                  <div className="text-xs font-medium text-green-600 dark:text-green-400">
                    ✓ Allowed
                  </div>
                  <div className="space-y-1">
                    {selectedPreset.capabilities.allowed.length > 0 ? (
                      selectedPreset.capabilities.allowed.map((cap) => (
                        <div
                          key={cap}
                          className="flex items-center gap-2 text-xs bg-green-50/50 dark:bg-green-950/20 px-2 py-1 rounded"
                        >
                          <Check className="h-3 w-3 text-green-600 dark:text-green-400" />
                          {cap}
                        </div>
                      ))
                    ) : (
                      <div className="text-xs text-muted-foreground italic">
                        No capabilities allowed
                      </div>
                    )}
                  </div>
                </div>

                {/* Denied Capabilities */}
                <div className="space-y-2">
                  <div className="text-xs font-medium text-red-600 dark:text-red-400">
                    ✗ Not Allowed
                  </div>
                  <div className="space-y-1">
                    {selectedPreset.capabilities.denied.length > 0 ? (
                      selectedPreset.capabilities.denied.map((cap) => (
                        <div
                          key={cap}
                          className="flex items-center gap-2 text-xs bg-red-50/50 dark:bg-red-950/20 px-2 py-1 rounded"
                        >
                          <EyeOff className="h-3 w-3 text-red-600 dark:text-red-400" />
                          {cap}
                        </div>
                      ))
                    ) : (
                      <div className="text-xs text-muted-foreground italic">
                        All capabilities allowed
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Paths */}
            <div>
              <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <FolderOpen className="h-4 w-4" />
                File Access
              </h4>
              <div className="grid gap-3 sm:grid-cols-2">
                {/* Allowed Paths */}
                <div className="space-y-2">
                  <div className="text-xs font-medium text-green-600 dark:text-green-400">
                    ✓ Can Access
                  </div>
                  <div className="space-y-1">
                    {selectedPreset.paths.allowed.length > 0 ? (
                      selectedPreset.paths.allowed.map((path) => (
                        <div
                          key={path}
                          className="text-xs bg-green-50/50 dark:bg-green-950/20 px-2 py-1 rounded"
                        >
                          <div className="font-mono text-[10px] text-muted-foreground">
                            {getUserFriendlyPathName(path)}
                          </div>
                          <div className="text-[10px] text-muted-foreground mt-0.5">
                            {expandPathPlaceholders(path)}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-xs text-muted-foreground italic">
                        {selectedPreset.level === 'advanced'
                          ? 'Choose specific paths below'
                          : 'No file access allowed'}
                      </div>
                    )}
                  </div>
                </div>

                {/* Denied Paths */}
                <div className="space-y-2">
                  <div className="text-xs font-medium text-red-600 dark:text-red-400">
                    ✗ Cannot Access
                  </div>
                  <div className="space-y-1">
                    {selectedPreset.paths.denied.length > 0 ? (
                      selectedPreset.paths.denied.map((path) => (
                        <div
                          key={path}
                          className="text-xs bg-red-50/50 dark:bg-red-950/20 px-2 py-1 rounded"
                        >
                          <div className="font-mono text-[10px] text-muted-foreground">
                            {getUserFriendlyPathName(path)}
                          </div>
                          <div className="text-[10px] text-muted-foreground mt-0.5">
                            {expandPathPlaceholders(path)}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-xs text-muted-foreground italic">
                        No paths explicitly blocked
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Long Description */}
            {selectedPreset.longDescription && (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  {selectedPreset.longDescription}
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>

      {/* Advanced Options Toggle */}
      <Card className={cn('border-dashed', showAdvanced && 'border-solid')}>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="font-semibold flex items-center gap-2">
                <Settings2 className="h-4 w-4" />
                Advanced Permission Matrix
              </div>
              <p className="text-xs text-muted-foreground">
                {showAdvanced
                  ? 'Hide advanced options and use simple presets'
                  : 'Show detailed permission matrix for fine-grained control'}
              </p>
            </div>
            <Switch
              checked={showAdvanced}
              onCheckedChange={onShowAdvancedChange || (() => {})}
            />
          </div>

          {showAdvanced && (
            <Alert variant="warning" className="mt-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Advanced permissions require technical understanding of security implications.
                Most users should use the presets above.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Safety Notice */}
      <Alert>
        <Shield className="h-4 w-4" />
        <AlertDescription className="text-xs">
          <strong>Security First:</strong> Team-X uses a permission system to keep your data safe.
          Start with Safe Mode and increase permissions only as needed. You can change permissions at any
          time from this panel.
        </AlertDescription>
      </Alert>
    </div>
  );
}