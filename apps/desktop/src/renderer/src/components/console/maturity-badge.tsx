import { FEATURE_MATURITY, type MaturityFeature } from '@team-x/shared-types';

import { Tag } from './tag';

/**
 * The preview label for a surface listed in FEATURE_MATURITY (audit
 * 2026-10-07 P2-3). A neutral Tag, not a status lamp: it describes what the
 * feature is, not how it is doing. The registry's one-line summary is the
 * accessible description, so a screen reader hears what "preview" means here.
 */
export function MaturityBadge({ feature }: { feature: MaturityFeature }) {
  const entry = FEATURE_MATURITY[feature];
  return (
    <Tag
      data-maturity={entry.maturity}
      data-maturity-feature={feature}
      title={entry.summary}
      aria-label={`${entry.badge}: ${entry.summary}`}
    >
      {entry.badge}
    </Tag>
  );
}
