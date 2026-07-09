/**
 * Phase 7b Settings-cluster sweep contract (source-string pins).
 * Per-file: console-present + legacy-absent + selectors-preserved.
 * The cross-file legacy-absence guard + amoled-menu-surface recipe check
 * land with the final task (Phase-3 lesson 5: global pins land last).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const featuresDir = dirname(fileURLToPath(import.meta.url));
const readSrc = (rel: string) => readFileSync(join(featuresDir, rel), 'utf8');

describe('settings-view shell sweep', () => {
  const src = readSrc('settings/settings-view.tsx');

  it('drops the amoled shell for a console layout', () => {
    expect(src).toContain('<Faceplate');
    expect(src).not.toContain('amoled-menu-surface');
    expect(src).not.toMatch(/\bbg-black\b/);
    // NOTE: `text-h1 text-foreground` is a CURRENT Carbon type token, not legacy —
    // the console recompose KEEPS the <h1> title inside the Faceplate body.
  });

  it('preserves all 15 scroll targets + the focus effect', () => {
    for (const sel of [
      'data-settings-section="enhanced-ai"',
      'data-settings-section="extensions"',
      'data-settings-section="portability"',
      'data-settings-section="memory"',
      'data-settings-section="providers"',
    ]) {
      expect(src).toContain(sel);
    }
    expect(src).toContain('settingsFocusSection');
    expect(src).toContain('scrollIntoView');
    expect(src).toContain('componentName="UpdaterSection"');
  });
});

describe('updater-section sweep', () => {
  const src = readSrc('settings/updater-section.tsx');

  it('composes from console primitives', () => {
    expect(src).toContain('<Faceplate');
    expect(src).toContain('bg-[var(--go-soft)]');
    expect(src).toContain('bg-[var(--armed-soft)]');
  });

  it('carries zero legacy composition', () => {
    expect(src).not.toContain('bg-surface-50');
    expect(src).not.toContain('bg-surface-100');
    expect(src).not.toContain('bg-brand/5');
    expect(src).not.toContain('text-brand');
    expect(src).not.toMatch(/\b(text|bg|border)-(red|green|blue)-[0-9]/);
  });

  it('preserves update handlers + copy', () => {
    expect(src).toContain('checkUpdate.mutate()');
    expect(src).toContain('installUpdate.mutate()');
    expect(src).toContain('Check for Updates');
    expect(src).toContain('Install & Restart');
    expect(src).toContain('Team-X never phones home');
  });
});

describe('runtime-section sweep', () => {
  const src = readSrc('settings/runtime-section.tsx');

  it('composes from console primitives', () => {
    expect(src).toContain('<Faceplate');
    expect(src).toContain('<MetricTile');
    expect(src).toContain('border-[var(--armed-edge)] bg-[var(--armed-soft)]');
  });

  it('carries zero legacy composition', () => {
    expect(src).not.toContain('brand-selected');
    expect(src).not.toContain('bg-surface-50');
    expect(src).not.toContain('text-brand');
  });

  it('preserves strategy wiring + hardware readouts', () => {
    expect(src).toContain('setRuntime.mutate({ strategy: opt.value })');
    expect(src).toContain('orchestrator slot');
    expect(src).toContain('{hw.cpuCores} cores');
    expect(src).toContain('{hw.totalRamGb} GB');
  });
});

describe('privacy-section sweep', () => {
  const src = readSrc('settings/privacy-section.tsx');

  it('composes from console primitives', () => {
    expect(src).toContain('<Faceplate');
    expect(src).toContain('border-[var(--armed-edge)] bg-[var(--armed-soft)]');
    expect(src).toContain('TIER_LED');
  });

  it('carries zero brand-selected or legacy palette', () => {
    expect(src).not.toContain('brand-selected');
    expect(src).not.toContain('bg-surface-50');
    expect(src).not.toContain('text-green-400');
    expect(src).not.toContain('text-destructive');
  });

  it('preserves tier wiring + provider availability', () => {
    expect(src).toContain('setPrivacy.mutate({ maxTier: opt.value })');
    expect(src).toContain('Allowed');
    expect(src).toContain('Blocked');
    expect(src).toContain('Local Only');
  });
});

describe('concurrency-section sweep', () => {
  const src = readSrc('settings/concurrency-section.tsx');

  it('composes from console primitives', () => {
    expect(src).toContain('<Faceplate');
    expect(src).toContain('<SubviewState');
  });

  it('carries zero legacy composition', () => {
    expect(src).not.toContain('bg-surface-50');
    expect(src).not.toContain('bg-background/40');
  });

  it('preserves slot + cap wiring', () => {
    expect(src).toContain('id="orchestrator-slots"');
    expect(src).toContain('commitSlots');
    expect(src).toContain('commitProviderCap');
    expect(src).toContain('provider-cap-${kind}');
  });
});

describe('agentic-section sweep', () => {
  const src = readSrc('settings/agentic-section.tsx');

  it('composes from console primitives', () => {
    expect(src).toContain('<Faceplate');
    expect(src).toContain('<SubviewState');
  });

  it('carries zero legacy composition', () => {
    expect(src).not.toContain('bg-surface-50');
    expect(src).not.toContain('text-red-400');
    expect(src).not.toContain('bg-red-500/10');
  });

  it('preserves budget-knob wiring', () => {
    expect(src).toContain('id="agentic-max-steps"');
    expect(src).toContain('id="agentic-max-tokens"');
    expect(src).toContain('id="agentic-timeout-ms"');
    expect(src).toContain('budget_exhausted');
  });
});

describe('planner-section sweep', () => {
  const src = readSrc('settings/planner-section.tsx');

  it('composes from console primitives + console select', () => {
    expect(src).toContain('<Faceplate');
    expect(src).toContain('<SubviewState');
    expect(src).toContain('well-input h-8 w-full px-3 text-code-sm');
  });

  it('carries zero legacy composition', () => {
    expect(src).not.toContain('bg-surface-50');
    expect(src).not.toContain('bg-background px-3');
    expect(src).not.toContain('text-red-400');
  });

  it('preserves knob + approval wiring', () => {
    expect(src).toContain('id="planner-max-tickets"');
    expect(src).toContain('id="planner-approval-level"');
    expect(src).toContain('commitLevel');
    expect(src).toContain('decompose_project');
  });
});

describe('permissions-section sweep', () => {
  const src = readSrc('settings/permissions-section.tsx');

  it('composes from console primitives', () => {
    expect(src).toContain('<Faceplate');
    expect(src).toContain('<SubviewState');
    expect(src).toContain('border-[var(--armed-edge)] bg-[var(--armed-soft)]');
  });

  it('carries zero shadcn-card or brand-selected composition', () => {
    expect(src).not.toContain("from '@/components/ui/card'");
    expect(src).not.toContain('brand-selected');
    expect(src).not.toContain('border-destructive/30');
    expect(src).not.toContain('bg-muted/20');
  });

  it('preserves preset selectors + LAW test hooks', () => {
    expect(src).toContain('data-permissions-section=""');
    expect(src).toContain('data-testid={`preset-card-${key}`}');
    expect(src).toContain('id={`preset-${key}`}');
    expect(src).toContain('aria-label={`${key}-preset`}');
    expect(src).toContain('aria-label="Show advanced authority matrix"');
    expect(src).toContain('applyPreset');
    expect(src).toContain('Safe Mode');
    expect(src).toContain('Standard');
    expect(src).toContain('Advanced');
  });
});

describe('memory-section sweep', () => {
  const src = readSrc('settings/memory-section.tsx');

  it('composes from console primitives', () => {
    expect(src).toContain('<Faceplate');
    expect(src).toContain('<RecessedWell');
    expect(src).toContain('border-[var(--armed-edge)] bg-[var(--armed-soft)]');
  });

  it('carries zero legacy chooser or panel composition', () => {
    expect(src).not.toContain('brand-selected');
    expect(src).not.toContain('border-white/10 bg-black/10');
    expect(src).not.toContain('bg-surface-50');
    expect(src).not.toContain('text-red-400');
  });

  it('preserves budget chooser + knob wiring', () => {
    expect(src).toContain('data-settings-memory=""');
    expect(src).toContain('id="memory-recent-turn-limit"');
    expect(src).toContain('id="memory-checkpoint-history-limit"');
    expect(src).toContain("commit('defaultTargetTokenBudget'");
    expect(src).toContain('Default pack budget');
  });
});

describe('backup-section sweep', () => {
  const src = readSrc('settings/backup-section.tsx');

  it('composes from console primitives', () => {
    expect(src).toContain('<Faceplate');
    expect(src).toContain('<SubviewState');
    expect(src).toContain('<Tag');
    expect(src).toContain('cap-warn');
  });

  it('carries zero legacy surface or palette composition', () => {
    expect(src).not.toContain('bg-surface-50');
    expect(src).not.toContain('bg-surface-100');
    expect(src).not.toContain('text-green-400');
    expect(src).not.toContain('text-red-400');
    expect(src).not.toContain('bg-green-500/10');
  });

  it('preserves backup action wiring + delete selectors', () => {
    expect(src).toContain('data-backup-delete={backup.filename}');
    expect(src).toContain('aria-label={`Delete backup ${backup.filename}`}');
    expect(src).toContain('createBackup.mutate');
    expect(src).toContain('restoreBackup.mutate');
    expect(src).toContain('deleteBackup.mutate');
    expect(src).toContain('Create Backup');
    expect(src).toContain('Overwrite all data?');
  });
});

describe('enhanced-ai-section sweep', () => {
  const src = readSrc('settings/enhanced-ai-section.tsx');

  // Form/knob panels stay adaptive chassis, not RecessedWells: `.well` is
  // opaque-dark in both shifts, so `text-foreground` labels would vanish on
  // the Day-Shift silver face. Consistent with concurrency/agentic/planner.
  it('composes from console primitives', () => {
    expect(src).toContain('<Faceplate');
    expect(src).toContain('<LampTile');
    expect(src).toContain('<Switch');
    expect(src).toContain('className="brand-range"');
  });

  it('carries zero legacy panel or palette composition', () => {
    expect(src).not.toContain('bg-surface-50');
    expect(src).not.toContain('text-green-400');
    expect(src).not.toContain('text-red-400');
    expect(src).not.toContain('text-amber-400');
    expect(src).not.toContain('border-green-400/40');
  });

  it('preserves LLM config ids + feature toggles', () => {
    expect(src).toContain('id="ai-llm-provider"');
    expect(src).toContain('id="ai-llm-temperature"');
    expect(src).toContain('id="ai-planning-threshold"');
    expect(src).toContain('id="ai-tracing-sample-rate"');
    expect(src).toContain("commit('queryExpansionEnabled'");
    expect(src).toContain('aria-label="Toggle distributed tracing"');
  });
});

describe('copilot-section sweep', () => {
  const src = readSrc('settings/copilot-section.tsx');

  // The hand-rolled `<button role="switch">` becomes a Radix <Switch>, which
  // supplies role/aria-checked at runtime — the E2E `#copilot-enabled`
  // selector still resolves. Knob panel stays chassis (form, not display).
  it('composes from console primitives + Switch', () => {
    expect(src).toContain('<Faceplate');
    expect(src).toContain('<Switch');
    expect(src).toContain('border-[var(--armed-edge)] bg-[var(--armed-soft)]');
  });

  it('drops the hand-rolled toggle + raw-hex palette', () => {
    expect(src).not.toContain('bg-surface-50');
    expect(src).not.toContain('#FFAA2024');
    expect(src).not.toContain('role="switch"');
    expect(src).not.toContain('bg-surface-200');
    expect(src).not.toContain('text-red-400');
  });

  it('preserves copilot control ids + weight selectors', () => {
    expect(src).toContain('id="copilot-enabled"');
    expect(src).toContain('id="copilot-interval-minutes"');
    expect(src).toContain('data-copilot-weight-category={cat}');
    expect(src).toContain('id={`copilot-weight-${cat}`}');
    expect(src).toContain('commitEnabled');
    expect(src).toContain('toggleCategory');
    expect(src).toContain('commitWeight');
    expect(src).toContain('Allowed Categories');
    expect(src).toContain('Category weighting');
  });
});

describe('extensions-section sweep', () => {
  const src = readSrc('settings/extensions-section.tsx');

  // The four shadcn Cards become console Faceplates; the color-coded permission
  // Badge becomes a LampTile status lamp (allow=GO / deny=NO-GO / prompt=HOLD);
  // inventory + proactive counts become phosphor MetricTiles. The autonomy
  // chooser stays chassis carrying the armed selection tint.
  it('composes from console primitives', () => {
    expect(src).toContain('<Faceplate');
    expect(src).toContain('<MetricTile');
    expect(src).toContain('<SubviewState');
    expect(src).toContain('<Tag');
    expect(src).toContain('<LampTile');
    expect(src).toContain('border-[var(--armed-edge)] bg-[var(--armed-soft)]');
  });

  it('carries zero shadcn-card or legacy palette composition', () => {
    expect(src).not.toContain("from '@/components/ui/card'");
    expect(src).not.toContain('brand-selected');
    expect(src).not.toContain('bg-muted/20');
    expect(src).not.toContain('bg-muted/30');
    expect(src).not.toContain('border-destructive/30');
    expect(src).not.toContain('bg-brand-900');
    expect(src).not.toContain('bg-red-950');
    expect(src).not.toContain('bg-amber-950');
  });

  it('preserves authority LAW selectors + handlers + card copy', () => {
    expect(src).toContain('data-extensions-authority-stable=""');
    expect(src).toContain('data-extension-add-skill=""');
    expect(src).toContain('data-extension-add-mcp=""');
    expect(src).toContain('handleProactiveToggle');
    expect(src).toContain('async function reviewRequest(');
    expect(src).toContain('<InstallSkillDialog');
    expect(src).toContain('<ImportMcpDialog');
    expect(src).toContain('Autonomy Policy');
    expect(src).toContain('Authority Snapshot');
    expect(src).toContain('Pending Authority Reviews');
    expect(src).toContain('Active Authority Grants');
  });
});

describe('rag-section sweep', () => {
  const src = readSrc('settings/rag-section.tsx');

  // One Faceplate wraps the section; form/knob panels stay adaptive chassis
  // (`.well` is opaque-dark in both shifts). Index Stats ride phosphor
  // MetricTiles, status badges become LampTiles, and the hand-rolled
  // `<button role="switch">` master toggle becomes a Radix Switch.
  it('composes from console primitives + Switch', () => {
    expect(src).toContain('<Faceplate');
    expect(src).toContain('<MetricTile');
    expect(src).toContain('<LampTile');
    expect(src).toContain('<SubviewState');
    expect(src).toContain('<Switch');
    expect(src).toContain('className="brand-range"');
  });

  it('drops the hand-rolled toggle + legacy surface/palette', () => {
    expect(src).not.toContain('bg-surface-50');
    expect(src).not.toContain('bg-surface-100');
    expect(src).not.toContain('role="switch"');
    expect(src).not.toContain('bg-brand');
    expect(src).not.toContain('text-green-400');
    expect(src).not.toContain('text-red-400');
    expect(src).not.toContain('text-amber-400');
    expect(src).not.toContain('bg-green-500/10');
    expect(src).not.toContain('border-green-400/40');
  });

  it('preserves RAG control ids + config + maintenance wiring', () => {
    expect(src).toContain('id="rag-enabled-toggle"');
    expect(src).toContain('aria-label="Enable RAG"');
    expect(src).toContain('id="rag-embedding-provider"');
    expect(src).toContain('id="rag-embedding-model"');
    expect(src).toContain('id="rag-embedding-dimension"');
    expect(src).toContain('id="rag-top-k"');
    expect(src).toContain('id="rag-threshold"');
    expect(src).toContain('id="rag-max-tokens"');
    expect(src).toContain('handleToggle');
    expect(src).toContain('handleRebuildConfirm');
    expect(src).toContain('handleDeleteConfirm');
    expect(src).toContain('Chunks Indexed');
    expect(src).toContain('Rebuild Index');
    expect(src).toContain('Delete All Embeddings');
  });
});

describe('proactive-controls sweep', () => {
  const src = readSrc('proactive/proactive-controls.tsx');

  // Orphan surface (no live importer — a Phase-8 purge candidate) recomposed in
  // place for console consistency: Card → Faceplate, autonomy chip → Tag,
  // Active/Queued/Last-Scan readouts → phosphor MetricTiles, empty/error →
  // SubviewState. The full-width Scan action stays a standard Button.
  it('composes from console primitives', () => {
    expect(src).toContain('<Faceplate');
    expect(src).toContain('<SubviewState');
    expect(src).toContain('<MetricTile');
    expect(src).toContain('<Tag');
  });

  it('carries zero shadcn-card or legacy palette composition', () => {
    expect(src).not.toContain("from '@/components/ui/card'");
    expect(src).not.toContain('bg-muted');
    expect(src).not.toContain('text-red-400');
    expect(src).not.toContain('border-red-400/30');
  });

  it('preserves proactive handlers, hook exports + status copy', () => {
    expect(src).toContain('handleToggleEnabled');
    expect(src).toContain('handleScanNow');
    expect(src).toContain('export function useDecomposeGoal()');
    expect(src).toContain('export function useScanForWork()');
    expect(src).toContain('aria-label="Toggle proactive mode"');
    expect(src).toContain('Proactive Mode');
    expect(src).toContain('Active Work');
    expect(src).toContain('Queued Work');
    expect(src).toContain('Last Scan');
    expect(src).toContain('Scan for Work Now');
  });
});

describe('portability-section sweep', () => {
  const src = readSrc('settings/portability-section.tsx');

  // Recomposed in five committed region sub-steps (16a-16e). Whole-file
  // legacy-absence pins land in 16e: this file's `emerald`/`bg-black/10`
  // tokens span several regions, and the source-string harness reads the file
  // as one string, so a whole-file negative can only pass once the last region
  // sweeps. Intermediate sub-steps therefore use positive + selector pins only.

  // 16a — tone helpers + section header/shell.
  it('composes the section header from a console faceplate + SYNC lamp', () => {
    expect(src).toContain('<Faceplate');
    expect(src).toContain('<LampTile');
    expect(src).toContain('label="SYNC"');
    expect(src).toContain('aria-label="Working"');
    expect(src).toContain('data-settings-portability=""');
  });

  it('re-tones the readiness/action/cloud-link maps onto the LED + armed families', () => {
    expect(src).toContain('bg-[var(--go-soft)]');
    expect(src).toContain('bg-[var(--hold-soft)]');
    expect(src).toContain('bg-[var(--warn-soft)]');
    expect(src).toContain('bg-[var(--armed-soft)]');
  });

  // 16b — cloud-link shell region.
  it('recomposes the cloud-link shell onto a chassis panel + neutral tags', () => {
    expect(src).toContain('data-cloud-link-shell=""');
    expect(src).toContain('rounded-inset border border-[var(--hairline)]');
    expect(src).toContain('<Tag');
    expect(src).toContain('Link Workspace');
    expect(src).toContain('Reconnect');
    expect(src).toContain('Unlink Workspace');
  });

  // 16c — sharing posture + chooser + readiness + operator invites.
  it('arms the sharing-mode chooser + preserves the invite-readiness shell', () => {
    expect(src).toContain('data-portability-invite-readiness=""');
    // brand-selected lives only in this chooser, so its whole-file negative
    // can already pass at 16c (unlike emerald, which spans regions).
    expect(src).not.toContain('brand-selected');
    expect(src).toContain('rounded-inset border px-3 py-3 text-left');
    expect(src).toContain('Open Autonomy Access');
    expect(src).toContain('pending invites');
  });

  // 16d — export/template/preview panels + manifest preview + plan + diagnostics.
  it('recomposes the preview/plan/diagnostics onto console chassis + scope accent', () => {
    expect(src).toContain('data-portability-manifest-preview=""');
    expect(src).toContain('data-portability-import-plan=""');
    expect(src).toContain('data-portability-runtime-template-diagnostics=""');
    // Runtime diagnostics is informational, so its brand-red accent becomes the
    // teal scope family — armed-red is reserved for command authority.
    expect(src).toContain('bg-[var(--scope-soft)]');
    expect(src).toContain('Manifest Preview');
    expect(src).toContain('Export Package');
    expect(src).toContain('Save Template');
    expect(src).toContain('Import Workspace');
    expect(src).toContain('Install Template');
  });

  // 16e — secret wizard + template library + whole-file legacy sweep.
  it('sweeps the secret wizard + library and preserves the secret binding hooks', () => {
    expect(src).toContain('data-portability-secret-wizard=""');
    expect(src).toContain('data-portability-secret-input={secret.id}');
    expect(src).toContain('Missing secret wizard');
    expect(src).toContain('Local template library');
    // secret wizard keeps its amber-caution intent on the hold family
    expect(src).toContain('bg-[var(--hold-soft)]');
  });

  it('carries zero legacy composition across the whole file', () => {
    expect(src).not.toContain('bg-surface-50');
    expect(src).not.toContain('bg-black/10');
    expect(src).not.toContain('border-white/10');
    expect(src).not.toContain('bg-background/');
    expect(src).not.toContain('brand-selected');
    expect(src).not.toContain('emerald');
    expect(src).not.toContain('text-destructive');
    expect(src).not.toContain('bg-brand');
    expect(src).not.toContain('text-brand');
    expect(src).not.toContain('border-brand');
    expect(src).not.toMatch(/\b(bg|text|border)-(red|green|amber|blue)-[0-9]/);
  });
});

describe('providers-section sweep', () => {
  const src = readSrc('settings/providers-section.tsx');

  it('composes the host from a console faceplate + subview states', () => {
    expect(src).toContain('<Faceplate');
    expect(src).toContain('<SubviewState');
  });

  it('carries zero legacy palette', () => {
    expect(src).not.toContain('text-destructive');
    expect(src).not.toContain("from '@/components/ui/skeleton");
  });

  it('preserves the add-provider action + card grid mount', () => {
    expect(src).toContain('setAddOpen(true)');
    expect(src).toContain('<ProviderCard');
    expect(src).toContain('<AddProviderDialog');
    expect(src).toContain('Add Provider');
    expect(src).toContain('AI Providers');
  });
});

describe('provider-card sweep', () => {
  const src = readSrc('settings/provider-card.tsx');

  it('composes the card shell from a console faceplate + tier LED map', () => {
    expect(src).toContain('<Faceplate');
    expect(src).toContain('<Tag');
    // Tier is a category coding, not a health status: local/open/proprietary =
    // go/scope/hold. Amber caution is kept on --led-hold (not --led-warn).
    expect(src).toContain("local: 'text-[var(--led-go)] border-[var(--led-go-edge)]'");
    expect(src).toContain("'proprietary-cloud': 'text-[var(--led-hold)] border-[var(--led-hold-edge)]'");
    expect(src).toContain('well-input h-8 w-full px-3 text-code-sm');
  });

  it('drops the raw card/select palette + status greens', () => {
    expect(src).not.toContain('bg-surface-50');
    expect(src).not.toContain('bg-surface-100');
    expect(src).not.toContain('text-green-400');
    expect(src).not.toContain('text-blue-400');
    expect(src).not.toContain('text-amber-400');
    expect(src).not.toContain('bg-background');
  });

  it('preserves provider handlers, model ids, tier labels + action copy', () => {
    expect(src).toContain('function handleToggle()');
    expect(src).toContain('function handleSaveKey(');
    expect(src).toContain('function handleTest()');
    expect(src).toContain('function handleRemove()');
    expect(src).toContain('saveOllamaModel');
    expect(src).toContain('id={`provider-model-${provider.id}`}');
    expect(src).toContain('id={`provider-model-select-${provider.id}`}');
    expect(src).toContain('Set API Key');
    expect(src).toContain('Connected');
    expect(src).toContain('Detected Local Models');
    expect(src).toContain('Detected Cloud Models');
    expect(src).toContain('Suggested Cloud Models');
    expect(src).toContain('TIER_LABEL: Record<PrivacyTier, string>');
  });
});

describe('add-provider-dialog sweep', () => {
  const src = readSrc('settings/add-provider-dialog.tsx');

  it('recomposes the hand-rolled panel + selects onto console vocabulary', () => {
    expect(src).toContain('bg-[var(--carbon-850)]');
    expect(src).toContain("'well-input flex h-10 w-full px-3 py-2 text-body'");
  });

  it('drops the raw panel + select palette', () => {
    expect(src).not.toContain('bg-background');
    expect(src).not.toContain('border-input');
    expect(src).not.toContain('text-destructive');
  });

  it('preserves the dialog contract, handlers, field ids + keychain copy', () => {
    expect(src).toContain('<Dialog open={open} onOpenChange={onOpenChange}');
    expect(src).toContain('function handleSubmit(');
    expect(src).toContain('function handleKindChange(');
    expect(src).toContain('id="provider-kind"');
    expect(src).toContain('id="provider-name"');
    expect(src).toContain('id="provider-tier"');
    expect(src).toContain('id="provider-key"');
    expect(src).toContain('id="provider-url"');
    expect(src).toContain('Add Provider');
    expect(src).toContain('Stored in your OS keychain');
  });
});

describe('import-mcp-dialog sweep', () => {
  const src = readSrc('settings/import-mcp-dialog.tsx');

  it('recomposes the dialog content onto console vocabulary', () => {
    expect(src).toContain("'well-input flex h-10 w-full px-3 py-2 text-body'");
    expect(src).toContain('<Tag');
    expect(src).toContain('rounded-inset border border-[var(--hairline)]');
  });

  it('drops the legacy palette', () => {
    expect(src).not.toContain('text-destructive');
    expect(src).not.toContain('bg-muted');
    expect(src).not.toContain('bg-surface-50');
    expect(src).not.toContain('emerald');
  });

  it('preserves the dialog contract, submit + field ids', () => {
    expect(src).toContain('<DialogContent>');
    expect(src).toContain('<DialogTitle>Import MCP</DialogTitle>');
    expect(src).toContain('function handleSubmit(');
    expect(src).toContain('id="mcp-import-mode"');
    expect(src).toContain('id="mcp-template"');
    expect(src).toContain('id="mcp-transport"');
  });
});

describe('install-skill-dialog sweep', () => {
  const src = readSrc('settings/install-skill-dialog.tsx');

  it('arms the source chooser + retints error boxes onto console tokens', () => {
    expect(src).toContain('border-[var(--armed-edge)] bg-[var(--armed-soft)]');
    expect(src).toContain('bg-[var(--warn-soft)]');
  });

  it('drops the brand chooser + destructive palette', () => {
    expect(src).not.toContain('bg-brand');
    expect(src).not.toContain('border-brand');
    expect(src).not.toContain('text-destructive');
    expect(src).not.toContain('selectClass');
  });

  it('preserves the dialog contract, submit + skill source selectors', () => {
    expect(src).toContain('<DialogTitle>Install Skill</DialogTitle>');
    expect(src).toContain('function handleSubmit(');
    expect(src).toContain('data-skill-source-local=""');
    expect(src).toContain('data-skill-source-url=""');
    expect(src).toContain('data-skill-folder-path=""');
    expect(src).toContain('id="skill-folder-path"');
  });
});
