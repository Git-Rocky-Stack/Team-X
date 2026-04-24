import type { UserGuideRole } from '@team-x/shared-types';

import type {
  ActiveView,
  AutonomySubview,
  DashboardSubview,
  SettingsSectionFocus,
  TelemetrySubview,
} from '@/store/app-store.js';

export type GuidePriority = 'core' | 'recommended' | 'advanced';
export type GuideTaskKind = 'auto' | 'manual' | 'jump';
export type GuideBlockTone = 'default' | 'accent' | 'warning';
export type GuideAutoRule =
  | 'provider-enabled'
  | 'employee-exists'
  | 'extension-installed'
  | 'authority-reviewed';

export interface GuideSignals {
  hasEnabledProvider: boolean;
  hasEmployees: boolean;
  hasExtensions: boolean;
  hasAuthorityActivity: boolean;
}

export type GuideBlock =
  | {
      kind: 'paragraph';
      text: string;
    }
  | {
      kind: 'bullets';
      items: string[];
    }
  | {
      kind: 'callout';
      tone?: GuideBlockTone;
      title: string;
      text: string;
    };

export type GuideAction =
  | {
      id: string;
      label: string;
      description: string;
      kind: 'view';
      view: ActiveView;
      dashboardSubview?: DashboardSubview;
      telemetrySubview?: TelemetrySubview;
      autonomySubview?: AutonomySubview;
    }
  | {
      id: string;
      label: string;
      description: string;
      kind: 'settings';
      section: SettingsSectionFocus;
    }
  | {
      id: string;
      label: string;
      description: string;
      kind: 'hire';
      view?: ActiveView;
    };

export interface GuideTask {
  id: string;
  title: string;
  description: string;
  roles: UserGuideRole[];
  priority: GuidePriority;
  kind: GuideTaskKind;
  actionId?: string;
  autoRule?: GuideAutoRule;
}

export interface GuideSection {
  id: string;
  title: string;
  summary: string;
  category: string;
  roles: UserGuideRole[];
  blocks: GuideBlock[];
  taskIds: string[];
  actionIds?: string[];
}
