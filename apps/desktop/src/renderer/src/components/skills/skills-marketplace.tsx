/**
 * Skills Marketplace - User-friendly skill management interface
 *
 * Transforms the complex technical UI into a simple card-based marketplace
 * where users can browse, enable, and manage skills with one click.
 */

import { Check, Globe, Loader2, Plus, Settings2, Star, Zap } from 'lucide-react';
import { useState } from 'react';

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
  BUILT_IN_SKILLS,
  type BuiltInSkill,
  SKILL_CATEGORY_INFO,
  type SkillCategory,
} from '@/data/built-in-skills.js';
import { cn } from '@/lib/utils.js';

interface SkillsMarketplaceProps {
  installedSkills: Set<string>;
  enabledSkills: Set<string>;
  onToggleSkill: (skillId: string, enabled: boolean) => void;
  onInstallCustomSkill: () => void;
  isLoading?: boolean;
}

export function SkillsMarketplace({
  installedSkills,
  enabledSkills,
  onToggleSkill,
  onInstallCustomSkill,
  isLoading = false,
}: SkillsMarketplaceProps) {
  const [selectedCategory, setSelectedCategory] = useState<SkillCategory | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showOnlyPopular, setShowOnlyPopular] = useState(false);
  const [showOnlyEnabled, setShowOnlyEnabled] = useState(false);

  // Filter skills based on current selections
  const filteredSkills = BUILT_IN_SKILLS.filter((skill) => {
    // Category filter
    if (selectedCategory !== 'all' && skill.category !== selectedCategory) {
      return false;
    }

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesSearch =
        skill.name.toLowerCase().includes(query) ||
        skill.description.toLowerCase().includes(query) ||
        skill.tools.some((tool) => tool.toLowerCase().includes(query));
      if (!matchesSearch) return false;
    }

    // Popular filter
    if (showOnlyPopular && !skill.popular) return false;

    // Enabled filter
    if (showOnlyEnabled && !enabledSkills.has(skill.id)) return false;

    return true;
  });

  const categories: Array<{ value: SkillCategory | 'all'; label: string; icon: string }> = [
    { value: 'all', label: 'All Skills', icon: 'apps' },
    ...Object.entries(SKILL_CATEGORY_INFO).map(([category, info]) => ({
      value: category as SkillCategory,
      label: info.name,
      icon: info.icon,
    })),
  ];

  return (
    <div className="space-y-6">
      {/* Header with title and actions */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-h2 text-foreground">Skills Marketplace</h2>
          <p className="text-body text-muted-foreground">
            Browse and enable AI capabilities for your agents
          </p>
        </div>
        <Button onClick={onInstallCustomSkill} size="sm" className="gap-2">
          <Plus className="h-4 w-4" />
          Install Custom Skill
        </Button>
      </div>

      {/* Search and filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4">
            {/* Search */}
            <div className="space-y-2">
              <Label htmlFor="skill-search">Search Skills</Label>
              <div className="relative">
                <Globe className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="skill-search"
                  placeholder="Search by name, description, or tool..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            {/* Category and filter controls */}
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="category-select">Category</Label>
                <Select
                  value={selectedCategory}
                  onValueChange={(value) => setSelectedCategory(value as SkillCategory | 'all')}
                >
                  <SelectTrigger id="category-select">
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
                <Label htmlFor="popular-filter">Popular Only</Label>
                <div className="flex items-center gap-2 h-10 px-3 rounded-md border">
                  <Switch
                    id="popular-filter"
                    checked={showOnlyPopular}
                    onCheckedChange={setShowOnlyPopular}
                  />
                  <span className="text-body text-muted-foreground">
                    {showOnlyPopular ? 'Popular skills' : 'All skills'}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="enabled-filter">Enabled Only</Label>
                <div className="flex items-center gap-2 h-10 px-3 rounded-md border">
                  <Switch
                    id="enabled-filter"
                    checked={showOnlyEnabled}
                    onCheckedChange={setShowOnlyEnabled}
                  />
                  <span className="text-body text-muted-foreground">
                    {showOnlyEnabled ? 'Enabled skills' : 'All skills'}
                  </span>
                </div>
              </div>
            </div>

            {/* Results summary */}
            <div className="flex items-center justify-between text-body text-muted-foreground">
              <span>Showing {filteredSkills.length} skill(s)</span>
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-500" />
                <span>{enabledSkills.size} enabled</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Skills grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : filteredSkills.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Globe className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-h3 mb-2">No skills found</p>
            <p className="text-body text-muted-foreground">
              Try adjusting your filters or search terms
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredSkills.map((skill) => (
            <SkillCard
              key={skill.id}
              skill={skill}
              isInstalled={installedSkills.has(skill.id)}
              isEnabled={enabledSkills.has(skill.id)}
              onToggle={() => onToggleSkill(skill.id, !enabledSkills.has(skill.id))}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface SkillCardProps {
  skill: BuiltInSkill;
  isInstalled: boolean;
  isEnabled: boolean;
  onToggle: () => void;
}

function SkillCard({ skill, isInstalled, isEnabled, onToggle }: SkillCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const categoryInfo = SKILL_CATEGORY_INFO[skill.category];

  return (
    <Card
      className={cn(
        'transition-all hover:shadow-md cursor-pointer',
        isEnabled && 'border-green-500/50 bg-green-50/5 dark:bg-green-950/10',
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
                  ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                  : 'bg-primary/10 text-primary',
              )}
            >
              <Globe className="h-5 w-5" />
            </div>

            {/* Title and description */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <CardTitle className="text-h3 truncate">{skill.name}</CardTitle>
                {skill.popular && <Star className="h-3.5 w-3.5 text-yellow-500 fill-yellow-500" />}
                {skill.new && <Zap className="h-3.5 w-3.5 text-blue-500" />}
              </div>
              <CardDescription className="line-clamp-2">{skill.description}</CardDescription>
            </div>
          </div>

          {/* Enable/Disable switch */}
          <Switch
            checked={isEnabled}
            onCheckedChange={onToggle}
            disabled={!isInstalled}
            className="shrink-0"
          />
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Category and capabilities badges */}
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="gap-1">
            <Globe className="h-3 w-3" />
            {categoryInfo.name}
          </Badge>
          {skill.capabilities.map((capability) => (
            <Badge key={capability} variant="secondary" className="text-xs">
              {capability}
            </Badge>
          ))}
          {skill.requiresApiKey && (
            <Badge variant="warning" className="text-xs">
              <Settings2 className="h-3 w-3 mr-1" />
              API Key Required
            </Badge>
          )}
        </div>

        {/* Tools collapsible */}
        <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
          <CollapsibleTrigger className="text-caption text-muted-foreground hover:text-foreground transition-colors w-full text-left">
            <div className="flex items-center justify-between">
              <span>View {skill.tools.length} tool(s)</span>
              <span>{isExpanded ? '▼' : '▶'}</span>
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-3 space-y-1">
              {skill.tools.map((tool) => (
                <div key={tool} className="text-caption text-muted-foreground flex items-center gap-2">
                  <Check className="h-3 w-3 text-green-500" />
                  <code className="bg-muted px-1.5 py-0.5 rounded text-code-sm">{tool}</code>
                </div>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Installation status */}
        {!isInstalled && (
          <div className="text-caption text-muted-foreground italic">
            Not installed - click switch to install and enable
          </div>
        )}
      </CardContent>

      {/* Footer with long description teaser */}
      {skill.longDescription && (
        <CardFooter className="pt-0">
          <Collapsible>
            <CollapsibleTrigger className="text-caption text-muted-foreground hover:text-foreground transition-colors">
              Learn more →
            </CollapsibleTrigger>
            <CollapsibleContent>
              <p className="text-caption text-muted-foreground mt-2 leading-relaxed">
                {skill.longDescription}
              </p>
            </CollapsibleContent>
          </Collapsible>
        </CardFooter>
      )}
    </Card>
  );
}
