// packages/local-gguf-runtime/src/metadata/tool-capable-list.test.ts
import { describe, expect, it } from 'vitest';
import { isToolCapable } from './tool-capable-list';

// The S3 head fixtures truncate before `tokenizer.chat_template`, so these
// cases mirror the real (arch, name, tags) the parser extracts from each head.
// chat_template is intentionally absent here to exercise the name/tags
// fallback path — the same path the parser hits on the 256 KB heads.

describe('isToolCapable — name + tags fallback (chat_template absent)', () => {
  const toolCapable: Array<{ id: string; arch: string; name: string; tags: string[] }> = [
    { id: '01', arch: 'llama', name: 'Meta Llama 3.1 8B Instruct', tags: ['llama', 'llama-3'] },
    { id: '02', arch: 'llama', name: 'Mistral-7B-Instruct-v0.3', tags: [] },
    { id: '03', arch: 'qwen2', name: 'Qwen2.5 7B Instruct', tags: ['chat', 'text-generation'] },
    {
      id: '07',
      arch: 'llama',
      name: 'Hermes 3 Llama 3.1 8B',
      tags: ['function calling', 'json mode', 'chatml'],
    },
    { id: '10', arch: 'llama', name: 'Llama 3.2 3B Instruct', tags: ['llama', 'llama-3'] },
    { id: '11', arch: 'llama', name: 'Llama 3.3 70B Instruct', tags: ['llama', 'llama-3'] },
  ];

  const notToolCapable: Array<{ id: string; arch: string; name: string; tags: string[] }> = [
    { id: '04', arch: 'gemma2', name: 'gemma-2-9b-it', tags: [] },
    { id: '05', arch: 'phi3', name: 'Phi 3.5 Mini Instruct', tags: ['nlp', 'code'] },
    {
      id: '06',
      arch: 'deepseek2',
      name: 'DeepSeek-Coder-V2-Lite-Instruct',
      tags: [],
    },
    { id: '08', arch: 'nomic-bert', name: 'nomic-embed-text-v1.5', tags: [] },
    { id: '09', arch: 'bert', name: 'bge-large-en-v1.5', tags: [] },
  ];

  for (const c of toolCapable) {
    it(`${c.id} ${c.name} → true`, () => {
      expect(isToolCapable({ arch: c.arch, name: c.name, tags: c.tags })).toBe(true);
    });
  }

  for (const c of notToolCapable) {
    it(`${c.id} ${c.name} → false`, () => {
      expect(isToolCapable({ arch: c.arch, name: c.name, tags: c.tags })).toBe(false);
    });
  }
});

describe('isToolCapable — chat_template primary signal', () => {
  it('Llama 3.1 ipython/python_tag scaffolding → true', () => {
    const chatTemplate =
      '{{- bos_token }}{%- if tools %}...<|python_tag|>{{ tool_call }}...environment: ipython';
    expect(
      isToolCapable({ arch: 'llama', name: 'Some Custom Llama', tags: [], chatTemplate }),
    ).toBe(true);
  });

  it('Mistral [TOOL_CALLS] scaffolding → true', () => {
    const chatTemplate = '{%- if tools %}[AVAILABLE_TOOLS]...[/AVAILABLE_TOOLS]...[TOOL_CALLS]';
    expect(isToolCapable({ arch: 'llama', name: 'mystery-model', tags: [], chatTemplate })).toBe(
      true,
    );
  });

  it('Qwen / Hermes <tool_call> scaffolding → true', () => {
    const chatTemplate = '{%- if tools %}<tools>{{ tool }}</tools>...<tool_call>{{ name }}';
    expect(isToolCapable({ arch: 'qwen2', name: 'mystery', tags: [], chatTemplate })).toBe(true);
  });

  it('plain chat template with no tool scaffolding → false', () => {
    const chatTemplate =
      "{% for message in messages %}{{ '<start_of_turn>' + message['role'] }}{% endfor %}";
    expect(isToolCapable({ arch: 'gemma2', name: 'gemma-2-9b-it', tags: [], chatTemplate })).toBe(
      false,
    );
  });
});

describe('isToolCapable — base model negative cases', () => {
  it('Qwen2.5 BASE model (no instruct signal) → false', () => {
    // The family heuristic requires both the version pattern AND the "instruct"
    // signal. A base-model name like "Qwen2.5-7B" must not be classified as
    // tool-capable just because the arch is qwen2.
    expect(isToolCapable({ arch: 'qwen2', name: 'Qwen2.5-7B', tags: [] })).toBe(false);
  });
});

describe('isToolCapable — curated tool-finetune name patterns', () => {
  it.each(['Hermes-2-Pro-Mistral-7B', 'NousResearch Functionary', 'firefunction-v2', 'xLAM-7b'])(
    'recognizes tool-finetune family in %s',
    (name) => {
      expect(isToolCapable({ arch: 'llama', name, tags: [] })).toBe(true);
    },
  );

  it('embedding arch is never tool-capable even with a tool-ish name', () => {
    expect(isToolCapable({ arch: 'bert', name: 'hermes-embed', tags: ['function calling'] })).toBe(
      false,
    );
  });
});
