/**
 * MCP Marketplace - User-friendly MCP server management interface
 *
 * Transforms the complex technical MCP configuration into a simple card-based marketplace
 * where users can browse, install, and manage MCP servers with one click.
 */

import {
  AlertCircle,
  Check,
  Database,
  Globe,
  Loader2,
  Plus,
  Settings2,
  Star,
  Zap,
} from 'lucide-react';
import { useState } from 'react';

import { Alert, AlertDescription } from '@/components/ui/alert.js';
import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card.js';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible.js';
import { Input } from '@/components/ui/input.js';
import { Label } from '@/components/ui/label.js';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select.js';
import { Switch } from '@/components/ui/switch.js';
import {
  BUILT_IN_MCP_TEMPLATES,
  type BuiltInMcpTemplate,
  MCP_CATEGORY_INFO,
  type McpCategory,
  autoConfigureFilesystemMcp,
} from '@/data/built-in-mcp-templates.js';
import { cn } from '@/lib/utils.js';

export type McpConnectionStatus = 'ready' | 'needs_api_key' | 'needs_connection' | 'error';

interface McpMarketplaceProps {
  installedMcps: Set<string>;
  enabledMcps: Set<string>;
  onToggleMcp: (templateId: string, enabled: boolean) => void;
  onInstallMcp: (templateId: string) => Promise<void>;
  onConfigureMcp?: (templateId: string) => void;
  onInstallCustomMcp?: () => void;
  isLoading?: boolean;
  connectionStatus?: Map<string, McpConnectionStatus>;
}

export function McpMarketplace({
  installedMcps,
  enabledMcps,
  onToggleMcp,
  onInstallMcp,
  onConfigureMcp,
  onInstallCustomMcp,
  isLoading = false,
  connectionStatus = new Map(),
}: McpMarketplaceProps) {
  const [selectedCategory, setSelectedCategory] = useState<McpCategory | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showOnlyPopular, setShowOnlyPopular] = useState(false);
  const [showOnlyEnabled, setShowOnlyEnabled] = useState(false);
  const [configuringMcp, setConfiguringMcp] = useState<string | null>(null);

  // Filter MCPs based on current selections
  const filteredMcps = BUILT_IN_MCP_TEMPLATES.filter((mcp) => {
    // Category filter
    if (selectedCategory !== 'all' && mcp.category !== selectedCategory) {
      return false;
    }

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesSearch =
        mcp.name.toLowerCase().includes(query) || mcp.description.toLowerCase().includes(query);
      if (!matchesSearch) return false;
    }

    // Popular filter
    if (showOnlyPopular && !mcp.popular) return false;

    // Enabled filter
    if (showOnlyEnabled && !enabledMcps.has(mcp.id)) return false;

    return true;
  });

  const categories: Array<{ value: McpCategory | 'all'; label: string; icon: string }> = [
    { value: 'all', label: 'All MCP Servers', icon: 'apps' },
    ...Object.entries(MCP_CATEGORY_INFO).map(([category, info]) => ({
      value: category as McpCategory,
      label: info.name,
      icon: info.icon,
    })),
  ];

  async function handleInstallClick(templateId: string) {
    setConfiguringMcp(templateId);
    try {
      await onInstallMcp(templateId);
    } finally {
      setConfiguringMcp(null);
    }
  }

  function handleConfigureClick(templateId: string) {
    if (onConfigureMcp) {
      onConfigureMcp(templateId);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header with title and actions */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-h2 text-foreground">MCP Server Marketplace</h2>
          <p className="text-body text-muted-foreground">
            Connect powerful external services and databases to your agents
          </p>
        </div>
        <div className="flex gap-2">
          {onInstallCustomMcp && (
            <Button onClick={onInstallCustomMcp} size="sm" variant="outline" className="gap-2">
              <Plus className="h-4 w-4" />
              Custom MCP
            </Button>
          )}
        </div>
      </div>

      {/* Search and filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4">
            {/* Search */}
            <div className="space-y-2">
              <Label htmlFor="mcp-search">Search MCP Servers</Label>
              <div className="relative">
                <Globe className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="mcp-search"
                  placeholder="Search by name or description..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            {/* Category and filter controls */}
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="mcp-category-select">Category</Label>
                <Select
                  value={selectedCategory}
                  onValueChange={(value) => setSelectedCategory(value as McpCategory | 'all')}
                >
                  <SelectTrigger id="mcp-category-select">
                    <SelectValue placeholder="All categories" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat.value} value={cat.value}>
                        {cat.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="mcp-popular-filter">Popular Only</Label>
                <div className="flex items-center gap-2 h-10 px-3 rounded-md border">
                  <Switch
                    id="mcp-popular-filter"
                    checked={showOnlyPopular}
                    onCheckedChange={setShowOnlyPopular}
                  />
                  <span className="text-body text-muted-foreground">
                    {showOnlyPopular ? 'Popular MCPs' : 'All MCPs'}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="mcp-enabled-filter">Enabled Only</Label>
                <div className="flex items-center gap-2 h-10 px-3 rounded-md border">
                  <Switch
                    id="mcp-enabled-filter"
                    checked={showOnlyEnabled}
                    onCheckedChange={setShowOnlyEnabled}
                  />
                  <span className="text-body text-muted-foreground">
                    {showOnlyEnabled ? 'Enabled MCPs' : 'All MCPs'}
                  </span>
                </div>
              </div>
            </div>

            {/* Results summary */}
            <div className="flex items-center justify-between text-body text-muted-foreground">
              <span>Showing {filteredMcps.length} MCP server(s)</span>
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-500" />
                <span>{enabledMcps.size} enabled</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* MCP grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : filteredMcps.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Database className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-h3 mb-2">No MCP servers found</p>
            <p className="text-body text-muted-foreground">
              Try adjusting your filters or search terms
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredMcps.map((mcp) => {
            // Handle filesystem MCP auto-configuration
            const displayMcp =
              mcp.id === 'filesystem-local' && mcp.autoConfigure
                ? autoConfigureFilesystemMcp()
                : mcp;

            return (
              <McpTemplateCard
                key={mcp.id}
                template={displayMcp}
                isInstalled={installedMcps.has(mcp.id)}
                isEnabled={enabledMcps.has(mcp.id)}
                isConfiguring={configuringMcp === mcp.id}
                connectionStatus={connectionStatus.get(mcp.id)}
                onToggle={() => onToggleMcp(mcp.id, !enabledMcps.has(mcp.id))}
                onInstall={() => handleInstallClick(mcp.id)}
                onConfigure={() => handleConfigureClick(mcp.id)}
                hasConfigureHandler={!!onConfigureMcp}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

interface McpTemplateCardProps {
  template: BuiltInMcpTemplate;
  isInstalled: boolean;
  isEnabled: boolean;
  isConfiguring: boolean;
  connectionStatus?: McpConnectionStatus;
  onToggle: () => void;
  onInstall: () => void;
  onConfigure: () => void;
  hasConfigureHandler: boolean;
}

function McpTemplateCard({
  template,
  isInstalled,
  isEnabled,
  isConfiguring,
  connectionStatus,
  onToggle,
  onInstall,
  onConfigure,
  hasConfigureHandler,
}: McpTemplateCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const categoryInfo = MCP_CATEGORY_INFO[template.category];
  const showApiKeyWarning = template.requiresApiKey && connectionStatus === 'needs_api_key';

  return (
    <Card
      className={cn(
        'transition-all hover:shadow-md cursor-pointer',
        isEnabled && 'border-blue-500/50 bg-blue-50/5 dark:bg-blue-950/10',
        !isInstalled && 'opacity-60',
      )}
    >
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            {/* Icon */}
            <div
              className={cn(
                'p-2 rounded-lg shrink-0',
                isEnabled
                  ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                  : 'bg-primary/10 text-primary',
              )}
            >
              <Database className="h-5 w-5" />
            </div>

            {/* Title and description */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <CardTitle className="text-h3 truncate">{template.name}</CardTitle>
                {template.popular && (
                  <Star className="h-3.5 w-3.5 text-yellow-500 fill-yellow-500" />
                )}
                {template.new && <Zap className="h-3.5 w-3.5 text-blue-500" />}
              </div>
              <CardDescription className="line-clamp-2">{template.description}</CardDescription>
            </div>
          </div>

          {/* Enable/Disable switch or Install button */}
          {isInstalled ? (
            <Switch
              checked={isEnabled}
              onCheckedChange={onToggle}
              disabled={isConfiguring}
              className="shrink-0"
            />
          ) : (
            <Button
              size="sm"
              onClick={onInstall}
              disabled={isConfiguring}
              className="shrink-0 gap-1"
            >
              {isConfiguring ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Installing...
                </>
              ) : (
                <>
                  <Plus className="h-3 w-3" />
                  Install
                </>
              )}
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Category and capabilities badges */}
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="gap-1">
            <Database className="h-3 w-3" />
            {categoryInfo.name}
          </Badge>
          <Badge variant="secondary" className="text-xs">
            {template.transport}
          </Badge>
          {template.capabilities.map((capability) => (
            <Badge key={capability} variant="secondary" className="text-xs">
              {capability}
            </Badge>
          ))}
          {template.requiresApiKey && (
            <Badge variant="warning" className="text-xs">
              <Settings2 className="h-3 w-3 mr-1" />
              API Key Required
            </Badge>
          )}
        </div>

        {/* Tool count and status */}
        <div className="flex items-center justify-between text-caption text-muted-foreground">
          <span>{template.toolCount} tools available</span>
          {connectionStatus && (
            <Badge
              variant={connectionStatus === 'ready' ? 'default' : 'secondary'}
              className="text-xs"
            >
              {connectionStatus === 'ready' && <Check className="h-3 w-3 mr-1" />}
              {connectionStatus === 'needs_api_key' && <AlertCircle className="h-3 w-3 mr-1" />}
              {connectionStatus.replace('_', ' ')}
            </Badge>
          )}
        </div>

        {/* Configuration details (collapsible) */}
        <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
          <CollapsibleTrigger className="text-caption text-muted-foreground hover:text-foreground transition-colors w-full text-left">
            <div className="flex items-center justify-between">
              <span>View configuration details</span>
              <span>{isExpanded ? '▼' : '▶'}</span>
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-3 space-y-2 text-caption">
              <div className="bg-muted/50 p-2 rounded">
                <div className="text-code-sm break-all">
                  <span className="text-muted-foreground">$</span> {template.command}{' '}
                  {template.args.join(' ')}
                </div>
              </div>
              {template.env && Object.keys(template.env).length > 0 && (
                <div>
                  <div className="font-medium mb-1">Environment Variables:</div>
                  <div className="space-y-1">
                    {Object.entries(template.env).map(([key, value]) => (
                      <div key={key} className="flex items-center gap-2">
                        <code className="bg-muted px-1.5 py-0.5 rounded text-code-sm">{key}</code>
                        <span className="text-muted-foreground">{value ? '***' : '(empty)'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {template.autoConfigure && (
                <Alert>
                  <Check className="h-3 w-3" />
                  <AlertDescription className="text-caption">
                    Auto-configured with safe default paths for your operating system
                  </AlertDescription>
                </Alert>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* API key warning */}
        {showApiKeyWarning && (
          <Alert variant="warning">
            <AlertCircle className="h-3 w-3" />
            <AlertDescription className="text-caption">
              API key required. Configure {template.apiKeyName ?? 'the required API key'}.
            </AlertDescription>
          </Alert>
        )}

        {/* Installation status */}
        {!isInstalled && (
          <div className="text-caption text-muted-foreground italic">
            Not installed - click to add this MCP server
          </div>
        )}
      </CardContent>

      {/* Footer with configure button and long description */}
      <CardFooter className="pt-0 flex justify-between">
        {template.longDescription && (
          <Collapsible>
            <CollapsibleTrigger className="text-caption text-muted-foreground hover:text-foreground transition-colors">
              Learn more →
            </CollapsibleTrigger>
            <CollapsibleContent>
              <p className="text-caption text-muted-foreground mt-2 leading-relaxed">
                {template.longDescription}
              </p>
            </CollapsibleContent>
          </Collapsible>
        )}

        {isInstalled && hasConfigureHandler && (
          <Button size="sm" variant="outline" onClick={onConfigure} className="gap-1">
            <Settings2 className="h-3 w-3" />
            Configure
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
