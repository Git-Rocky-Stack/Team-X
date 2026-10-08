/**
 * Unit tests for the chair-model minutes reply parser and prompt.
 *
 * The end-to-end path (governed model call → minutes → tickets, plus the
 * transcript fallbacks) is pinned in `meeting-service.test.ts`; these pin
 * the parser's contract: tolerant of fences/prose, strict on fields.
 */

import { describe, expect, it } from 'vitest';

import {
  MAX_MEETING_ACTION_ITEMS,
  buildMinutesUserPrompt,
  parseMinutesReply,
} from './meeting-minutes.js';

const ATTENDEES = new Set(['emp-a', 'emp-b']);

describe('parseMinutesReply', () => {
  it('parses bare JSON', () => {
    expect(
      parseMinutesReply(
        '{"summary":"Agreed on scope.","actionItems":[{"title":"Write spec","assigneeId":"emp-a","priority":"low"}]}',
        ATTENDEES,
      ),
    ).toEqual({
      summary: 'Agreed on scope.',
      actionItems: [{ title: 'Write spec', assigneeId: 'emp-a', priority: 'low' }],
    });
  });

  it('tolerates a ```json fence and surrounding prose', () => {
    const raw = 'Sure, here you go:\n```json\n{"summary":"S","actionItems":[]}\n```\nThanks!';
    expect(parseMinutesReply(raw, ATTENDEES)).toEqual({ summary: 'S', actionItems: [] });
  });

  it('treats null assignee / priority as absent', () => {
    expect(
      parseMinutesReply(
        '{"summary":"S","actionItems":[{"title":"T","assigneeId":null,"priority":null}]}',
        ATTENDEES,
      )?.actionItems,
    ).toEqual([{ title: 'T' }]);
  });

  it('drops an assignee that is not an attendee but keeps the item', () => {
    expect(
      parseMinutesReply(
        '{"summary":"S","actionItems":[{"title":"T","assigneeId":"emp-ghost"}]}',
        ATTENDEES,
      )?.actionItems,
    ).toEqual([{ title: 'T' }]);
  });

  it.each([
    ['no JSON at all', 'The meeting went well.'],
    ['malformed JSON', '{"summary": "S", "actionItems": [}'],
    ['missing summary', '{"actionItems":[]}'],
    ['empty summary', '{"summary":"  ","actionItems":[]}'],
    ['missing actionItems', '{"summary":"S"}'],
    ['non-array actionItems', '{"summary":"S","actionItems":"none"}'],
    ['empty title', '{"summary":"S","actionItems":[{"title":""}]}'],
    ['non-string title', '{"summary":"S","actionItems":[{"title":42}]}'],
    ['unknown priority', '{"summary":"S","actionItems":[{"title":"T","priority":"urgent"}]}'],
  ])('rejects %s', (_label, raw) => {
    expect(parseMinutesReply(raw, ATTENDEES)).toBeNull();
  });

  it('rejects a reply with more action items than the ticket-flood cap', () => {
    const items = Array.from({ length: MAX_MEETING_ACTION_ITEMS + 1 }, (_, i) => ({
      title: `Item ${i}`,
    }));
    expect(
      parseMinutesReply(JSON.stringify({ summary: 'S', actionItems: items }), ATTENDEES),
    ).toBeNull();
  });
});

describe('buildMinutesUserPrompt', () => {
  it('lists attendee ids so the model can assign items', () => {
    const prompt = buildMinutesUserPrompt({
      agenda: 'Q3 plan',
      attendees: [{ id: 'emp-a', name: 'Alice', title: 'CEO' }],
      transcript: '**Alice:** Ship it.',
    });
    expect(prompt).toContain('Agenda: Q3 plan');
    expect(prompt).toContain('Alice (CEO) — id: emp-a');
    expect(prompt).toContain('**Alice:** Ship it.');
  });

  it('keeps the most recent discussion when the transcript is very long', () => {
    const transcript = `${'old '.repeat(10_000)}FINAL DECISION`;
    const prompt = buildMinutesUserPrompt({ agenda: '', attendees: [], transcript });
    expect(prompt).toContain('[earlier discussion truncated]');
    expect(prompt).toContain('FINAL DECISION');
    expect(prompt.length).toBeLessThan(transcript.length);
  });
});
