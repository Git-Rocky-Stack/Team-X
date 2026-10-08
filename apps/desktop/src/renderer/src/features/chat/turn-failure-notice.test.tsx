/**
 * TurnFailureNotice — the direct-line readout for a turn that failed or was
 * refused. Before it existed the `work.failed` reason reached no surface: a
 * Settings → Privacy refusal looked exactly like an employee ignoring you.
 *
 * @vitest-environment jsdom
 */
import '@/components/console/test-setup';

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TurnFailureNotice } from './turn-failure-notice.js';

const REFUSAL =
  'Provider "Anthropic (claude-haiku-4-5)" is Proprietary Cloud-tier, but Settings → Privacy allows Local Only. Choose a local provider (Ollama) for this employee or raise the privacy tier.';

describe('TurnFailureNotice', () => {
  it('announces who could not reply and the full reason', () => {
    render(<TurnFailureNotice employeeName="Iris" error={REFUSAL} />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Iris could not reply');
    expect(alert).toHaveTextContent(REFUSAL);
  });

  it('renders in a console well, not an ad-hoc box', () => {
    render(<TurnFailureNotice employeeName="Iris" error="boom" />);

    expect(screen.getByRole('alert')).toHaveClass('well');
  });
});
