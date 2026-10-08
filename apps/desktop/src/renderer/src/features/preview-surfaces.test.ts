/**
 * Preview surfaces stay labelled and honest (audit 2026-10-07 P2-3).
 *
 * The cloud workspace link, operator invites and cloud identities model a
 * hosted service that does not exist yet. These pins keep the preview badge
 * on every screen that shows them, keep a reserved link from reading as GO,
 * and keep wording that claimed hosted delivery or mirroring from returning.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const autonomy = readFileSync(join(here, 'autonomy', 'autonomy-view.tsx'), 'utf8');
const portability = readFileSync(join(here, 'settings', 'portability-section.tsx'), 'utf8');

describe('preview surfaces', () => {
  it('badge the cloud link and the invites wherever they appear', () => {
    for (const src of [autonomy, portability]) {
      expect(src).toContain('<MaturityBadge feature="cloudWorkspaceLink" />');
      expect(src).toContain('<MaturityBadge feature="operatorInvites" />');
    }
  });

  it('never show reserved ids as a GO link', () => {
    const tone = autonomy.slice(autonomy.indexOf('function cloudLinkTone'));
    expect(tone.slice(0, tone.indexOf('\n}'))).not.toMatch(/case 'linked':\s*return 'go'/);
    const pill = portability.slice(portability.indexOf('function cloudLinkTone'));
    expect(pill.slice(0, pill.indexOf('\n}'))).not.toMatch(/case 'linked':\s*return '[^']*led-go/);
  });

  it('drop the claims of hosted delivery, mirroring and readiness', () => {
    for (const src of [autonomy, portability]) {
      expect(src).not.toMatch(/queue hosted invites automatically/);
      expect(src).not.toMatch(/Hosted membership mirrored from/);
      expect(src).not.toMatch(/ready for hosted identity and event mirror/);
      expect(src).not.toMatch(/ready for the first hosted auth\/sync/);
    }
  });
});
