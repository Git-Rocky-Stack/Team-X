/**
 * @vitest-environment jsdom
 */
import './test-setup';

import { FEATURE_MATURITY } from '@team-x/shared-types';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MaturityBadge } from './index';

describe('MaturityBadge', () => {
  it('shows the registry badge and explains it to assistive tech', () => {
    render(<MaturityBadge feature="cloudWorkspaceLink" />);
    const badge = screen.getByText('Preview · local only');
    expect(badge).toHaveAttribute('data-maturity', 'preview');
    expect(badge).toHaveAttribute('data-maturity-feature', 'cloudWorkspaceLink');
    expect(badge).toHaveAccessibleName(
      `Preview · local only: ${FEATURE_MATURITY.cloudWorkspaceLink.summary}`,
    );
  });

  it('labels the lexical reranker as such', () => {
    render(<MaturityBadge feature="retrievalReranker" />);
    expect(screen.getByText('Preview · lexical')).toBeInTheDocument();
  });
});
