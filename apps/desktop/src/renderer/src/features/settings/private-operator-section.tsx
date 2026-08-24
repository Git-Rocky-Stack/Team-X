/**
 * Private Operator Access — the Settings panel for supervising this workspace
 * from a device that is not the workstation running it.
 *
 * ## What this panel is, and what it is not
 *
 * It is a *decision record*, not a switch. Nothing here opens a listener, and
 * there is deliberately no button that would: the main-process service is a
 * pure function that reads operator membership and returns which capabilities
 * the requested exposure would permit, which it refuses, and why. Rendering
 * that honestly is the whole job.
 *
 * The panel therefore shows refusals as prominently as permissions. A blocked
 * action rendered with its reason tells the operator what to change; a blocked
 * action silently omitted reads as "this feature does not exist", which is the
 * failure mode this surface exists to prevent.
 *
 * ## Design
 *
 * Command Console vocabulary per DESIGN.md — Faceplate chassis, stencil
 * word-lamps for status (GO / HOLD / NO-GO, steady: these are states, not
 * unacknowledged alerts, so no `alert` blink), RecessedWell for the guardrail
 * and action lists, Tag for the neutral action identifiers.
 *
 * Status is never colour-only: the lamp carries a stencil word, the exposure
 * buttons carry `aria-pressed`, and each action row carries a text verdict.
 */

import type {
  PrivateOperatorAccessActionDecision,
  PrivateOperatorAccessMode,
  PrivateOperatorAccessStatus,
} from '@team-x/shared-types';
import { PRIVATE_OPERATOR_ACCESS_MODES } from '@team-x/shared-types';
import { useState } from 'react';

import {
  Faceplate,
  LampTile,
  type LampTone,
  RecessedWell,
  Tag,
} from '@/components/console/index.js';
import { SubviewState } from '@/components/console/index.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { usePrivateOperatorPlan } from '@/hooks/use-private-operator.js';
import { cn } from '@/lib/utils.js';
import { useAppStore } from '@/store/app-store.js';

/** Steady lamps: a plan's status is a state, never an unacknowledged alert. */
function statusLamp(status: PrivateOperatorAccessStatus): { label: string; tone: LampTone } {
  switch (status) {
    case 'ready':
      return { label: 'GO', tone: 'go' };
    case 'warning':
      return { label: 'HOLD', tone: 'hold' };
    default:
      return { label: 'NO-GO', tone: 'nogo' };
  }
}

function modeLabel(mode: PrivateOperatorAccessMode): string {
  switch (mode) {
    case 'tailscale':
      return 'Tailscale';
    case 'hosted-bridge':
      return 'Hosted bridge';
    default:
      return 'Localhost';
  }
}

function modeHint(mode: PrivateOperatorAccessMode): string {
  switch (mode) {
    case 'tailscale':
      return 'Private tunnel; device admission and audit belong to the tunnel policy.';
    case 'hosted-bridge':
      return 'Read-only supervision only; launch and secret mutation stay local.';
    default:
      return 'Never leaves this machine. The only mode that can authorise secret changes.';
  }
}

function ActionRow({ decision }: { decision: PrivateOperatorAccessActionDecision }) {
  return (
    <li className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 border-[var(--hairline)] border-b px-3 py-2.5 last:border-b-0">
      <div className="flex min-w-0 flex-col gap-1">
        <Tag mono>{decision.action}</Tag>
        <p className="max-w-[62ch] text-caption text-muted-foreground leading-relaxed">
          {decision.reason}
        </p>
      </div>
      <LampTile
        small
        interactive={false}
        label={decision.allowed ? 'GO' : 'HOLD'}
        tone={decision.allowed ? 'go' : 'hold'}
      />
    </li>
  );
}

export function PrivateOperatorSection() {
  const companyId = useAppStore((state) => state.companyId);
  const [mode, setMode] = useState<PrivateOperatorAccessMode>('localhost');
  const planQuery = usePrivateOperatorPlan(companyId, { mode });
  const plan = planQuery.data;

  return (
    <section data-settings-private-operator="">
      <Faceplate kicker="Private Operator" serial="ACCESS" bodyClassName="space-y-4">
        <p className="max-w-[68ch] text-caption text-muted-foreground leading-relaxed">
          What this workspace would allow a non-workstation device to do, and why. Asking for a plan
          changes nothing and opens no listener — this is a decision record you read before deciding
          whether to expose anything at all.
        </p>

        {/* Exposure selector. Buttons, not a select: three fixed options with a
            one-line consequence each, and aria-pressed carries the state. */}
        <fieldset className="flex flex-wrap gap-2" data-private-operator-modes="">
          {/* A real <legend> rather than role="group" + aria-label: the native
              element already announces the grouping, and the visible heading
              would duplicate the Faceplate kicker, so it is screen-reader-only. */}
          <legend className="sr-only">Exposure mode</legend>
          {PRIVATE_OPERATOR_ACCESS_MODES.map((candidate) => {
            const active = candidate === mode;
            return (
              <button
                key={candidate}
                type="button"
                aria-pressed={active}
                onClick={() => setMode(candidate)}
                title={modeHint(candidate)}
                className={cn(
                  'rounded-inset border px-3 py-2 text-left transition-[background-color,border-color,box-shadow] duration-200 ease-out',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--armed-edge)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--carbon-900)]',
                  active
                    ? 'border-[var(--armed-edge)] bg-[var(--armed-soft)] text-[var(--armed-lit)]'
                    : 'border-[var(--hairline)] text-silver-mute hover:border-[var(--silver-mute)] hover:text-foreground',
                )}
              >
                <span className="block text-body-strong">{modeLabel(candidate)}</span>
                <span className="mt-0.5 block max-w-[34ch] text-caption text-muted-foreground leading-relaxed">
                  {modeHint(candidate)}
                </span>
              </button>
            );
          })}
        </fieldset>

        {companyId === null || companyId.length === 0 ? (
          <SubviewState
            lampLabel="STBY"
            lampTone="off"
            title="Select a workspace"
            description="Private operator access is planned per workspace. Choose one to see what it would allow."
            testId="private-operator-empty"
          />
        ) : planQuery.isPending ? (
          <div className="space-y-2" aria-busy="true">
            <Skeleton className="h-16 rounded-lg" />
            <Skeleton className="h-24 rounded-lg" />
          </div>
        ) : planQuery.isError || !plan ? (
          <SubviewState
            lampLabel="NO-GO"
            lampTone="nogo"
            title="The access plan could not be computed"
            description="The main process refused or failed to answer. Nothing was exposed."
            testId="private-operator-error"
          />
        ) : (
          <>
            <RecessedWell
              className="flex flex-wrap items-center justify-between gap-3 px-3 py-3"
              data-private-operator-status=""
            >
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-eyebrow-sm text-silver-mute uppercase tracking-[0.14em]">
                  Exposure
                </span>
                <span className="font-data text-body-strong text-foreground">{plan.exposure}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Tag mono>{`${plan.bindHost}:${plan.port}`}</Tag>
                {plan.operatorRole ? <Tag>{plan.operatorRole}</Tag> : null}
                <LampTile interactive={false} {...statusLamp(plan.status)} />
              </div>
            </RecessedWell>

            {plan.warnings.length > 0 ? (
              <ul className="space-y-1.5" data-private-operator-warnings="">
                {plan.warnings.map((warning) => (
                  <li
                    key={warning}
                    className="rounded-inset border border-[var(--led-nogo-edge)] bg-[var(--warn-soft)] px-3 py-2 text-caption text-[var(--led-nogo)] leading-relaxed"
                  >
                    {warning}
                  </li>
                ))}
              </ul>
            ) : null}

            <div className="space-y-2">
              <h3 className="text-eyebrow-sm text-silver-mute uppercase tracking-[0.14em]">
                Capabilities
              </h3>
              <RecessedWell className="overflow-hidden p-0">
                <ul>
                  {[...plan.allowedActions, ...plan.blockedActions].map((decision) => (
                    <ActionRow key={decision.action} decision={decision} />
                  ))}
                </ul>
              </RecessedWell>
            </div>

            <div className="space-y-2">
              <h3 className="text-eyebrow-sm text-silver-mute uppercase tracking-[0.14em]">
                Guardrails
              </h3>
              <ul className="space-y-1.5" data-private-operator-guardrails="">
                {plan.guardrails.map((guardrail) => (
                  <li
                    key={guardrail}
                    className="max-w-[72ch] text-caption text-muted-foreground leading-relaxed"
                  >
                    {guardrail}
                  </li>
                ))}
              </ul>
            </div>

            <div className="space-y-2">
              <h3 className="text-eyebrow-sm text-silver-mute uppercase tracking-[0.14em]">
                Recommended order
              </h3>
              <ol className="space-y-1.5">
                {plan.guidance.map((step) => (
                  <li
                    key={step}
                    className="max-w-[72ch] text-caption text-muted-foreground leading-relaxed"
                  >
                    {step}
                  </li>
                ))}
              </ol>
            </div>
          </>
        )}
      </Faceplate>
    </section>
  );
}
