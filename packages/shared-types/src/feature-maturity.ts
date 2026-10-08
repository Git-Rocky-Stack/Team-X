/**
 * Feature maturity (audit 2026-10-07 P2-3).
 *
 * Some reachable surfaces model a capability Team-X does not have yet: a
 * "linked" cloud workspace with no cloud behind it, operator invites that are
 * never sent, cloud identities nothing authenticates, a reranker that scores
 * by word overlap. Each is listed here with what it really does and what it
 * must do before it can drop the preview label, and the UI shows the badge
 * wherever it appears, so a placeholder never reads as a working feature.
 */

export type FeatureMaturity = 'stable' | 'preview';

export interface FeatureMaturityEntry {
  maturity: FeatureMaturity;
  /** `local-only`: nothing leaves this machine, whatever the UI calls it. */
  scope: 'local-only' | 'on-device';
  /** Short label for the badge, e.g. "Preview · local only". */
  badge: string;
  /** One honest sentence: what the surface actually does today. */
  summary: string;
  /** What has to be true, and tested, before the preview label comes off. */
  acceptance: readonly string[];
}

export const FEATURE_MATURITY = {
  cloudWorkspaceLink: {
    maturity: 'preview',
    scope: 'local-only',
    badge: 'Preview · local only',
    summary:
      'Linking reserves workspace and tenant ids on this device. There is no hosted service yet, so nothing is uploaded or synced.',
    acceptance: [
      'A hosted endpoint authenticates the device and accepts the reserved ids.',
      'Sync status (last sync, errors, cursors) reflects real round trips, tested end to end.',
    ],
  },
  operatorInvites: {
    maturity: 'preview',
    scope: 'local-only',
    badge: 'Preview · local only',
    summary:
      'Invites are recorded on this device. None is sent, and the invitee cannot accept from another machine.',
    acceptance: [
      'Invites are delivered to the invitee and accepted from their own device.',
      'Acceptance is authenticated and audited, tested end to end.',
    ],
  },
  sharedCloudIdentity: {
    maturity: 'preview',
    scope: 'local-only',
    badge: 'Preview · local only',
    summary:
      'Cloud operator identities are modelled here for future hosted supervision; nothing authenticates them yet.',
    acceptance: [
      'Cloud identities authenticate against a hosted identity provider.',
      'Hosted memberships are mirrored from a real service, not written locally.',
    ],
  },
  retrievalReranker: {
    maturity: 'preview',
    scope: 'on-device',
    badge: 'Preview · lexical',
    summary:
      'Retrieval reranks candidates by word overlap with the query, not with a learned cross-encoder model.',
    acceptance: [
      'A learned cross-encoder (local or configured API) scores candidates.',
      'Retrieval quality is measured against a labelled set before and after.',
    ],
  },
} as const satisfies Record<string, FeatureMaturityEntry>;

export type MaturityFeature = keyof typeof FEATURE_MATURITY;
