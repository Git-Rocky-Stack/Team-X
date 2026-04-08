export type RoleLevel =
  | 'officer'
  | 'senior_management'
  | 'management'
  | 'supervisor'
  | 'lead'
  | 'ic';

export type ModelTier = 'high' | 'mid' | 'low';

export type DecisionAuthority = 'final' | 'delegated' | 'advisory';

export interface RoleCadence {
  type: string;
  every: string;
  time: string;
}

export interface RoleFrontmatter {
  id: string;
  name: string;
  level: RoleLevel;
  reports_to: string[];
  manages: string[];
  preferred_model_tier: ModelTier;
  preferred_providers: string[];
  fallback_providers: string[];
  preferred_context_window?: number;
  tools_allowed: string[];
  tools_denied: string[];
  decision_authority: DecisionAuthority;
  escalates_to: string[];
  kpis: string[];
  cadences?: RoleCadence[];
  output_format?: string;
  temperature: number;
  license: string;
  author: string;
  version: string;
}

export interface RoleSpec {
  frontmatter: RoleFrontmatter;
  body: string;
  sourcePath: string;
  sha256: string;
}
