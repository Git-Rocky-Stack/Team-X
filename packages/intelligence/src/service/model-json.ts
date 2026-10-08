/**
 * Parse the JSON a language model was asked to return.
 *
 * Models asked to "respond with JSON" routinely wrap the payload — a ```json
 * fence, a sentence of preamble, a trailing remark. `JSON.parse` on the raw
 * reply throws on every one of those, which is how fact extraction failed on
 * ordinary replies. This takes, in order: the first fenced block, else the
 * span from the first `[`/`{` to the last matching closer.
 *
 * Throws when no JSON can be recovered, naming the reply's opening so the
 * failure is diagnosable rather than a bare "Unexpected token".
 */
export function parseModelJson(reply: string): unknown {
  const fenced = /```(?:json|JSON)?\s*\n?([\s\S]*?)```/.exec(reply);
  const candidates: string[] = [];
  if (fenced?.[1]) candidates.push(fenced[1]);

  const start = reply.search(/[[{]/);
  if (start !== -1) {
    const closer = reply[start] === '[' ? ']' : '}';
    const end = reply.lastIndexOf(closer);
    if (end > start) candidates.push(reply.slice(start, end + 1));
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate.trim());
    } catch {
      // Try the next candidate.
    }
  }
  throw new Error(`model reply did not contain valid JSON: ${JSON.stringify(reply.slice(0, 80))}`);
}
