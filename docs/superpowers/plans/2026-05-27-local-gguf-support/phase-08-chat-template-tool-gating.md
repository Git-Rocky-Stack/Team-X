# Phase 8 — Chat-template + Tool Gating Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development` or `superpowers:executing-plans`.
>
> **Cross-phase rules:** See master plan § "Cross-phase rules" (CR-1 through CR-10).
>
> **Codex Stage 3 review:** REQUIRED. Provider-router behavior change — Codex independent review is mandatory.

**Goal:** Wire end-to-end the chat-template auto-detection from GGUF metadata, per-model override UX, per-model system-prompt UX, tool-capability detection, and MCP-tool-injection gating in the provider-router. Phases 1–7 left the SQL columns + IPC channels + adapter logic in place; this phase fills in the UX + adapter integration that makes them useful.

**Architecture:** The chat-template auto-detection logic landed in Phase 3 (`metadata/chat-template-detect.ts` + GGUF parser already extracts `tokenizer.chat_template`). This phase adds: (a) the UX to view and override chat-template per model, (b) the UX to set system-prompt override per model, (c) curated list expansion + heuristic refinement for `isToolCapable` flag, (d) the MCP-tool-injection gating that the provider-router already partially implements but didn't expose surface for.

**Spec coverage:** Implements spec § 4.1.9 (chat-template auto-detect + per-model override), § 4.1.10 (per-model system-prompt override), § 4.1.11 (tool-calling capability badge + gating), § 9 spec line "Tool-capable badge" already partially in `ModelCard` (Phase 5) — gating logic wires up here.

**Estimated PR size:** ~1,200 LOC production + ~1,800 LOC tests. Single PR.

---

## Files this phase touches

### New files

```
apps/desktop/src/renderer/src/features/local-gguf/
├── chat-template-editor.tsx                       (in-line editor inside AdvancedPanel)
├── chat-template-editor.test.tsx
├── system-prompt-editor.tsx
├── system-prompt-editor.test.tsx
└── tool-capable-badge-tooltip.tsx                 (clarifies what tool-capable means on hover)

packages/local-gguf-runtime/src/metadata/
├── chat-template-detect.test.ts                   (extends existing — Phase 3 had a stub)

packages/intelligence/src/loop/
└── tool-gating.test.ts                            (regression test for orchestrator behavior)
```

### Modified files

```
packages/local-gguf-runtime/src/metadata/chat-template-detect.ts (extend with override resolution)
packages/local-gguf-runtime/src/metadata/tool-capable-list.ts    (expand curated patterns)
packages/local-gguf-runtime/src/metadata/tool-capable-list.test.ts
packages/provider-router/src/adapters/local-gguf.ts              (already strips tools when !isToolCapable; add explicit warning event surface for the orchestrator)
packages/provider-router/src/adapters/local-gguf.test.ts
packages/intelligence/src/loop/loop.ts                            (consume warning event; log via existing telemetry)
apps/desktop/src/renderer/src/features/local-gguf/advanced-panel.tsx (mount the two new editors)
apps/desktop/src/renderer/src/features/local-gguf/model-card.tsx  (tooltip on tool-capable badge)
CHANGELOG.md
```

---

## Tasks

### Task 1: Branch + sync

```bash
git checkout main && git pull --ff-only
git checkout -b feat/v3.3.0-phase-08-template-tool-gating
```

---

### Task 2: Expand tool-capable curated list (TDD)

**Files:**
- Modify: `packages/local-gguf-runtime/src/metadata/tool-capable-list.ts`
- Modify: `packages/local-gguf-runtime/src/metadata/tool-capable-list.test.ts`

Phase 3 shipped a minimal seed list. Expand to cover the major tool-trained model families. Current up-to-date list:

| Family | Sample model | Pattern |
|---|---|---|
| Hermes 2 / 2 Pro | `NousResearch/Hermes-2-Pro-Llama-3-8B` | `/hermes-?[23]/i` |
| Hermes 3 | `NousResearch/Hermes-3-Llama-3.1-8B` | `/hermes-?3/i` |
| Functionary | `meetkai/functionary-medium-v3.0` | `/functionary/i` |
| Firefunction | `fireworks-ai/firefunction-v2` | `/firefunction/i` |
| xLAM | `Salesforce/xLAM-7b-r` | `/xlam/i` |
| Mistral instruct v0.3+ (native tool support) | `mistralai/Mistral-7B-Instruct-v0.3` | `/mistral.*instruct.*v0\.[3-9]/i` |
| Llama 3.1+ Instruct (tool-trained at the family level) | `meta-llama/Meta-Llama-3.1-8B-Instruct` | `/llama-3\.[1-9]+.*instruct/i` |
| Qwen 2.5+ Instruct | `Qwen/Qwen2.5-7B-Instruct` | `/qwen2\.5.*instruct/i` |
| Command-R | `CohereForAI/c4ai-command-r-v01` | `/command-?r/i` |
| ToolACE | `Team-ACE/ToolACE-8B` | `/toolace/i` |

- [ ] **Step 1: TDD** — write tests asserting every family is detected positive, plus negative tests for known non-tool-capable models (Llama 3 base, base Mistral 7B v0.1, Gemma, Phi).

- [ ] **Step 2: Update the patterns array.**

```ts
// tool-capable-list.ts (updated)
const PATTERNS: RegExp[] = [
  /hermes-?[23]/i,
  /functionary/i,
  /firefunction/i,
  /xlam/i,
  /mistral.*instruct.*v0\.[3-9]/i,
  /llama-3\.[1-9]+.*instruct/i,
  /qwen2\.5.*instruct/i,
  /command-?r/i,
  /toolace/i,
  /nous.*tool/i,
];

export function isKnownToolCapable(arch: string, name: string, chatTemplate: string): boolean {
  for (const p of PATTERNS) {
    if (p.test(name)) return true;
  }
  // Chat-template markers are a secondary signal
  if (/<tool_call>|<\|tool\|>|<function_call>|<tool_use>/i.test(chatTemplate)) return true;
  return false;
}
```

- [ ] **Step 3: Run + commit.**

```
feat(local-gguf): expand tool-capable curated list to cover 10 model families
```

---

### Task 3: Chat-template resolution helper (TDD)

**Files:**
- Modify: `packages/local-gguf-runtime/src/metadata/chat-template-detect.ts`
- Modify: `packages/local-gguf-runtime/src/metadata/chat-template-detect.test.ts`

Phase 3 shipped a stub that reads `tokenizer.chat_template` from GGUF metadata. This task adds:
- `resolveChatTemplate(model, overrideFromUser)` — returns the effective template (override > GGUF-embedded > null).
- `detectTemplateFamily(template)` — returns one of `'llama3' | 'chatml' | 'mistral-instruct' | 'hermes' | 'gemma' | 'unknown'` for UI labeling.

- [ ] **Step 1: TDD.**

```ts
// chat-template-detect.test.ts
import { describe, expect, it } from 'vitest';
import { detectTemplateFamily, resolveChatTemplate } from './chat-template-detect';

describe('detectTemplateFamily', () => {
  it('recognises Llama 3 template', () => {
    const t = '<|begin_of_text|><|start_header_id|>user<|end_header_id|>{{prompt}}<|eot_id|>';
    expect(detectTemplateFamily(t)).toBe('llama3');
  });
  it('recognises ChatML template', () => {
    const t = '<|im_start|>user\n{{prompt}}<|im_end|>\n<|im_start|>assistant\n';
    expect(detectTemplateFamily(t)).toBe('chatml');
  });
  it('recognises Mistral instruct template', () => {
    const t = '[INST] {{prompt}} [/INST]';
    expect(detectTemplateFamily(t)).toBe('mistral-instruct');
  });
  it('recognises Hermes (subset of ChatML with tool support)', () => {
    const t = '<|im_start|>system\nYou have these tools: <tools>{{tools}}</tools><|im_end|>\n<|im_start|>user\n{{prompt}}<|im_end|>';
    expect(detectTemplateFamily(t)).toBe('hermes');
  });
  it('returns unknown for arbitrary templates', () => {
    expect(detectTemplateFamily('arbitrary {{prompt}}')).toBe('unknown');
  });
});

describe('resolveChatTemplate', () => {
  it('returns override when set', () => {
    expect(resolveChatTemplate({ ggufChatTemplate: 'GGUF', chatTemplateOverride: 'OVERRIDE' } as never)).toBe('OVERRIDE');
  });
  it('returns gguf when override null', () => {
    expect(resolveChatTemplate({ ggufChatTemplate: 'GGUF', chatTemplateOverride: null } as never)).toBe('GGUF');
  });
  it('returns null when both are null', () => {
    expect(resolveChatTemplate({ ggufChatTemplate: null, chatTemplateOverride: null } as never)).toBeNull();
  });
});
```

- [ ] **Step 2: Implement.**

```ts
// chat-template-detect.ts (extend)
import type { LocalModel } from '@team-x/shared-types';

export type TemplateFamily = 'llama3' | 'chatml' | 'mistral-instruct' | 'hermes' | 'gemma' | 'unknown';

export function resolveChatTemplate(model: Pick<LocalModel, 'ggufChatTemplate' | 'chatTemplateOverride'>): string | null {
  return model.chatTemplateOverride ?? model.ggufChatTemplate ?? null;
}

export function detectTemplateFamily(template: string): TemplateFamily {
  if (/<\|begin_of_text\|>|<\|start_header_id\|>/i.test(template)) return 'llama3';
  if (/<tools>.*<\/tools>/is.test(template) && /<\|im_start\|>/i.test(template)) return 'hermes';
  if (/<\|im_start\|>|<\|im_end\|>/i.test(template)) return 'chatml';
  if (/\[INST\]|\[\/INST\]/i.test(template)) return 'mistral-instruct';
  if (/<start_of_turn>|<end_of_turn>/i.test(template)) return 'gemma';
  return 'unknown';
}
```

- [ ] **Step 3: Run + commit.**

```
feat(local-gguf): chat-template resolution (override > GGUF) + family detection
```

---

### Task 4: `ChatTemplateEditor` component (TDD)

**Files:**
- Create: `apps/desktop/src/renderer/src/features/local-gguf/chat-template-editor.tsx` + test

Renders inside the AdvancedPanel. Three states:
- **Auto** (default): shows detected family (e.g. "Auto-detected: Llama 3"), read-only preview of the template, link to "Override"
- **Editing**: textarea with the override + Cancel + Save
- **Override active**: shows "Custom override active" badge + "Reset to GGUF default" button

- [ ] **Step 1: TDD.** Test each state transition. Test the save calls `localGguf.library.setChatTemplate`.

- [ ] **Step 2: Implement.**

```tsx
// chat-template-editor.tsx
import { useState } from 'react';
import type { LocalModel } from '@team-x/shared-types';
import { detectTemplateFamily, resolveChatTemplate } from '@team-x/local-gguf-runtime/metadata/chat-template-detect';
import { useSetChatTemplate } from '@/hooks/use-local-models';

export interface ChatTemplateEditorProps {
  model: LocalModel;
}

export function ChatTemplateEditor({ model }: ChatTemplateEditorProps) {
  const setChatTemplate = useSetChatTemplate();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>(resolveChatTemplate(model) ?? '');

  const effective = resolveChatTemplate(model);
  const family = effective ? detectTemplateFamily(effective) : 'unknown';
  const isOverride = model.chatTemplateOverride !== null;

  if (editing) {
    return (
      <div className="flex flex-col gap-2">
        <label className="text-xs font-medium" htmlFor={`chat-template-${model.id}`}>Chat template override</label>
        <textarea
          id={`chat-template-${model.id}`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={6}
          className="font-mono text-xs rounded border border-border bg-card p-2"
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={async () => { await setChatTemplate.mutateAsync({ id: model.id, template: draft || null }); setEditing(false); }}
            className="text-xs px-3 py-1 rounded bg-brand text-brand-foreground"
          >
            Save
          </button>
          <button type="button" onClick={() => { setDraft(resolveChatTemplate(model) ?? ''); setEditing(false); }} className="text-xs px-3 py-1 rounded border border-border">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-xs">
        <span className="text-muted-foreground">Chat template:</span>
        <span className="text-foreground">{family === 'unknown' ? 'Unknown / custom' : `Detected: ${family}`}</span>
        {isOverride && (
          <span className="text-[10px] px-1.5 py-0 border border-amber-400/40 bg-amber-400/10 text-amber-400 rounded">
            Override active
          </span>
        )}
      </div>
      {effective && (
        <pre className="font-mono text-[10px] bg-card border border-border rounded p-2 max-h-24 overflow-auto whitespace-pre-wrap">
          {effective.substring(0, 400)}{effective.length > 400 ? '…' : ''}
        </pre>
      )}
      <div className="flex gap-2">
        <button type="button" onClick={() => setEditing(true)} className="text-xs px-3 py-1 rounded border border-border">
          Override
        </button>
        {isOverride && (
          <button type="button" onClick={() => setChatTemplate.mutateAsync({ id: model.id, template: null })} className="text-xs px-3 py-1 rounded border border-border">
            Reset to GGUF default
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit.**

```
feat(local-gguf-ui): ChatTemplateEditor — three states (Auto/Editing/Override) + detected family display
```

---

### Task 5: `SystemPromptEditor` component (TDD)

**Files:**
- Create: `apps/desktop/src/renderer/src/features/local-gguf/system-prompt-editor.tsx` + test

Similar shape to ChatTemplateEditor but simpler: textarea + save + reset. Default state shows the override (if any) or "Not set — uses the role's system prompt".

- [ ] **Step 1: TDD.**

- [ ] **Step 2: Implement.**

```tsx
import { useState } from 'react';
import type { LocalModel } from '@team-x/shared-types';
import { useSetSystemPrompt } from '@/hooks/use-local-models';

export interface SystemPromptEditorProps {
  model: LocalModel;
}

export function SystemPromptEditor({ model }: SystemPromptEditorProps) {
  const setPrompt = useSetSystemPrompt();
  const [draft, setDraft] = useState(model.systemPromptOverride ?? '');
  const [dirty, setDirty] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs font-medium" htmlFor={`system-prompt-${model.id}`}>
        Per-model system prompt (overrides role's default)
      </label>
      <textarea
        id={`system-prompt-${model.id}`}
        value={draft}
        onChange={(e) => { setDraft(e.target.value); setDirty(true); }}
        rows={4}
        placeholder="Not set — uses the role's system prompt."
        className="text-xs rounded border border-border bg-card p-2"
      />
      {dirty && (
        <div className="flex gap-2">
          <button onClick={async () => { await setPrompt.mutateAsync({ id: model.id, prompt: draft || null }); setDirty(false); }} className="text-xs px-3 py-1 rounded bg-brand text-brand-foreground">
            Save
          </button>
          <button onClick={() => { setDraft(model.systemPromptOverride ?? ''); setDirty(false); }} className="text-xs px-3 py-1 rounded border border-border">
            Cancel
          </button>
        </div>
      )}
      {model.systemPromptOverride && !dirty && (
        <button onClick={async () => { await setPrompt.mutateAsync({ id: model.id, prompt: null }); setDraft(''); }} className="text-xs text-muted-foreground underline self-start">
          Clear override
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit.**

```
feat(local-gguf-ui): SystemPromptEditor — per-model override with save/cancel/clear
```

---

### Task 6: Mount both editors in `AdvancedPanel`

**Files:**
- Modify: `apps/desktop/src/renderer/src/features/local-gguf/advanced-panel.tsx`

Add a section between the numeric controls and the GPU visualizer:

```tsx
<section className="border-t border-border pt-4 flex flex-col gap-4">
  <h3 className="text-sm font-medium">Prompt & template</h3>
  <ChatTemplateEditor model={model} />
  <SystemPromptEditor model={model} />
</section>
```

Update the AdvancedPanel test to assert both editors render.

```
feat(local-gguf-ui): mount ChatTemplateEditor + SystemPromptEditor in AdvancedPanel
```

---

### Task 7: Tool-capable badge tooltip

**Files:**
- Create: `apps/desktop/src/renderer/src/features/local-gguf/tool-capable-badge-tooltip.tsx` + test
- Modify: `apps/desktop/src/renderer/src/features/local-gguf/model-card.tsx`

Wrap the existing tool-capable badge with a tooltip explaining what tool-capable means in Team-X (the model can call MCP tools; non-tool-capable models get tools stripped from agentic-loop prompts so they're not confused).

- [ ] **Step 1: Use the existing Radix Tooltip primitive (read `apps/desktop/src/renderer/src/components/ui/` for the precedent).**

```tsx
import * as Tooltip from '@radix-ui/react-tooltip';

export function ToolCapableBadgeTooltip({ children }: { children: React.ReactNode }) {
  return (
    <Tooltip.Provider>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content className="bg-popover text-popover-foreground border border-border rounded px-3 py-2 text-xs max-w-xs shadow-md" sideOffset={4}>
            This model has been fine-tuned for OpenAI-style function calling. Team-X will inject MCP tools into its prompts; non-tool-capable models would receive them too but typically can't use them correctly.
            <Tooltip.Arrow className="fill-border" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
```

- [ ] **Step 2: Wire into ModelCard.**

- [ ] **Step 3: Run + commit.**

```
feat(local-gguf-ui): tool-capable badge tooltip explains MCP gating
```

---

### Task 8: Explicit tool-gating warning event in `local-gguf` adapter

**Files:**
- Modify: `packages/provider-router/src/adapters/local-gguf.ts`
- Modify: `packages/provider-router/src/adapters/local-gguf.test.ts`

Phase 4 silently stripped `tools`/`tool_choice` when `isToolCapable=false`. This phase makes the strip observable so the orchestrator + audit log can see when tools were intended-but-stripped.

- [ ] **Step 1: Update the adapter to emit a `tools_stripped` event chunk in the stream BEFORE the first token:**

```ts
// excerpt of streamChat in local-gguf.ts
if (opts.tools && !model.isToolCapable) {
  // Emit a warning chunk before the token stream
  yield { kind: 'warning', code: 'tools_stripped', message: `Stripped ${opts.tools.length} tools — model ${opts.model} is not tool-capable` };
  // body.tools / body.tool_choice remain absent
}
```

Update the `StreamChatChunk` discriminated union:

```ts
export type StreamChatChunk =
  | { kind: 'token'; text: string }
  | { kind: 'tool_call'; id: string; name: string; arguments: string }
  | { kind: 'warning'; code: 'tools_stripped'; message: string }
  | { kind: 'done'; usage?: { prompt_tokens: number; completion_tokens: number } };
```

- [ ] **Step 2: Test that the warning fires.**

- [ ] **Step 3: Commit.**

```
feat(provider-router): local-gguf emits explicit 'tools_stripped' warning chunk before token stream
```

---

### Task 9: Orchestrator consumes the warning

**Files:**
- Modify: `packages/intelligence/src/loop/loop.ts`
- Create: `packages/intelligence/src/loop/tool-gating.test.ts`

The agentic loop currently treats every chunk uniformly. Update it to forward `warning` chunks to the events table via the existing telemetry path so audit logs reflect when an agent's tools were stripped.

- [ ] **Step 1: Read existing loop.ts to find the chunk handler.**

- [ ] **Step 2: Add a branch for `chunk.kind === 'warning'` that calls into the existing event emitter.**

- [ ] **Step 3: TDD regression test.**

```ts
// packages/intelligence/src/loop/tool-gating.test.ts
import { describe, expect, it, vi } from 'vitest';
import { runAgenticLoop } from './loop';

describe('agentic loop tool gating', () => {
  it('forwards tools_stripped warning to the event log', async () => {
    const emit = vi.fn();
    const fakeProvider = {
      streamChat: async function* () {
        yield { kind: 'warning', code: 'tools_stripped', message: 'stripped 3 tools' };
        yield { kind: 'token', text: 'hello' };
        yield { kind: 'done' };
      },
    };
    await runAgenticLoop({
      provider: fakeProvider as never,
      emitEvent: emit,
      // ...other deps...
    } as never);
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'agent.tools_stripped', message: 'stripped 3 tools' }));
  });
});
```

- [ ] **Step 4: Run + commit.**

```
feat(intelligence): forward provider 'tools_stripped' warning to event log
```

---

### Task 10: CHANGELOG + quality gate + PR

```markdown
### Added
- **Local & Networked GGUF Support (Phase 8 — Chat templates + tool
  gating)**: per-model chat-template auto-detect + override editor in
  the Advanced panel (recognises Llama 3 / ChatML / Mistral-Instruct /
  Hermes / Gemma families). Per-model system-prompt override editor.
  Expanded tool-capable curated list (Hermes 2/3, Functionary,
  Firefunction, xLAM, Mistral v0.3+, Llama 3.1+ Instruct, Qwen 2.5+
  Instruct, Command-R, ToolACE). Tool-capable badge tooltip explains
  the MCP gating behavior to users. Provider-router's `local-gguf`
  adapter now emits a typed `tools_stripped` warning chunk before
  streaming tokens whenever a non-tool-capable model received a
  request with tools — the orchestrator forwards the warning to the
  event log so audit history reflects the stripping.
```

Quality gate per master plan § CR-6/CR-7. Perf assertions:
- `resolveChatTemplate` + `detectTemplateFamily` < 1 ms.
- `isKnownToolCapable` < 1 ms (regex set is small).

**Codex Stage 3 MANDATORY** (provider-router behavior change).

---

## Phase 8 — Spec coverage map

| Spec section | Implemented by |
|---|---|
| § 4.1.9 chat-template auto-detect + override | Tasks 3, 4, 6 |
| § 4.1.10 per-model system-prompt override | Tasks 5, 6 |
| § 4.1.11 tool-capability detection + MCP gating | Tasks 2, 7, 8, 9 |
| § 19 acceptance criterion #8 (tool-capable get tools; non-capable do not) | Tasks 8, 9 |
