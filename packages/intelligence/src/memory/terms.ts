/**
 * Significant terms of a piece of text — the shared basis for deciding whether
 * a remembered fact or a knowledge-graph label bears on a question.
 *
 * Lower-cased word tokens, minus common function words, so "When does the
 * signing certificate expire?" contributes `signing`, `certificate`, `expire`
 * and not `when` / `does` / `the`. Tokens keep `+`, `#` and `.` inside a word
 * so `C++`, `C#` and `Node.js` survive as terms rather than splitting apart.
 */

const STOP_WORDS: ReadonlySet<string> = new Set([
  'a',
  'about',
  'after',
  'all',
  'also',
  'am',
  'an',
  'and',
  'any',
  'are',
  'as',
  'at',
  'be',
  'been',
  'being',
  'but',
  'by',
  'can',
  'could',
  'did',
  'do',
  'does',
  'for',
  'from',
  'had',
  'has',
  'have',
  'how',
  'i',
  'if',
  'in',
  'into',
  'is',
  'it',
  'its',
  'me',
  'my',
  'now',
  'of',
  'on',
  'or',
  'our',
  'right',
  'should',
  'so',
  'that',
  'the',
  'their',
  'them',
  'then',
  'there',
  'these',
  'they',
  'this',
  'to',
  'up',
  'us',
  'was',
  'we',
  'were',
  'what',
  'when',
  'where',
  'which',
  'who',
  'whom',
  'why',
  'will',
  'with',
  'would',
  'you',
  'your',
]);

/** Ordered significant terms of `text` (duplicates removed). */
export function significantTerms(text: string): string[] {
  const seen = new Set<string>();
  for (const raw of text.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}+#.'-]*/gu) ?? []) {
    // Trailing punctuation is sentence structure, not part of the term; `+`
    // and `#` are kept because they end real names (C++, C#).
    const token = raw.replace(/[.'-]+$/u, '');
    if (token.length === 0 || STOP_WORDS.has(token)) continue;
    seen.add(token);
  }
  return [...seen];
}

/**
 * Fraction of `queryTerms` that also appear in `candidate`'s terms, in [0, 1].
 * Zero when the query has no significant terms.
 */
export function termOverlap(queryTerms: readonly string[], candidate: string): number {
  if (queryTerms.length === 0) return 0;
  const candidateTerms = new Set(significantTerms(candidate));
  let shared = 0;
  for (const term of queryTerms) {
    if (candidateTerms.has(term)) shared += 1;
  }
  return shared / queryTerms.length;
}
