import { describe, expect, it } from 'vitest';
import { type ProviderStreamFn, streamAgent } from './stream.js';

// Minimal fake provider that yields a deterministic stream of chunks.
function fakeProviderFactory(): ProviderStreamFn {
  return async function* ({ system, messages }) {
    const reply = `Hello ${messages.at(-1)?.content ?? ''}. System was: ${system.slice(0, 10)}`;
    for (const ch of reply) yield { delta: ch };
    yield {
      done: true,
      usage: { promptTokens: 10, completionTokens: reply.length },
    };
  };
}

describe('streamAgent', () => {
  it('streams tokens and yields a final usage record', async () => {
    const collected: string[] = [];
    let final: { promptTokens: number; completionTokens: number } | null = null;
    for await (const chunk of streamAgent({
      providerFactory: fakeProviderFactory(),
      system: 'You are a CEO. Be terse.',
      messages: [{ role: 'user', content: 'Rocky' }],
    })) {
      if (chunk.kind === 'delta') collected.push(chunk.delta);
      if (chunk.kind === 'done') final = chunk.usage;
    }
    const fullReply = collected.join('');
    expect(fullReply).toContain('Hello Rocky');
    expect(fullReply).toContain('You are a');
    expect(final).not.toBeNull();
    expect(final?.promptTokens).toBe(10);
    expect(final?.completionTokens).toBe(fullReply.length);
  });

  it('forwards system + messages unchanged to the provider factory', async () => {
    let receivedSystem = '';
    let receivedMessages: { role: string; content: string }[] = [];
    const spy: ProviderStreamFn = async function* ({ system, messages }) {
      receivedSystem = system;
      receivedMessages = [...messages];
      yield { delta: 'ok' };
      yield { done: true, usage: { promptTokens: 1, completionTokens: 1 } };
    };
    const messages = [
      { role: 'user' as const, content: 'first' },
      { role: 'assistant' as const, content: 'reply' },
      { role: 'user' as const, content: 'second' },
    ];
    for await (const _ of streamAgent({
      providerFactory: spy,
      system: 'sys-prompt',
      messages,
    })) {
      // drain
    }
    expect(receivedSystem).toBe('sys-prompt');
    expect(receivedMessages).toEqual(messages);
  });

  it('forwards an abort signal unchanged to the provider factory', async () => {
    const controller = new AbortController();
    let receivedSignal: AbortSignal | undefined;
    const spy: ProviderStreamFn = async function* (input) {
      receivedSignal = (input as { signal?: AbortSignal }).signal;
      yield { done: true, usage: { promptTokens: 0, completionTokens: 0 } };
    };

    const args = {
      providerFactory: spy,
      system: 'sys-prompt',
      messages: [{ role: 'user' as const, content: 'stop' }],
      signal: controller.signal,
    };
    for await (const _ of streamAgent(args)) {
      // drain
    }

    expect(receivedSignal).toBe(controller.signal);
  });

  it('does not yield a done chunk when the provider never emits done', async () => {
    const noDone: ProviderStreamFn = async function* () {
      yield { delta: 'a' };
      yield { delta: 'b' };
      // no done
    };
    const chunks: string[] = [];
    for await (const c of streamAgent({
      providerFactory: noDone,
      system: '',
      messages: [],
    })) {
      chunks.push(c.kind);
    }
    expect(chunks).toEqual(['delta', 'delta']);
    expect(chunks).not.toContain('done');
  });
});
