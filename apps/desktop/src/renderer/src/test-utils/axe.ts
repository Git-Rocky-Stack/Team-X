/**
 * axe-core accessibility checks for jsdom suites (audit 2026-10-07 P2-1).
 *
 * Radix renders dialogs into a portal on `document.body`, so pass the body
 * (the default) to cover them. Rules that need real layout (colour contrast)
 * or a whole page (landmark regions) cannot be judged in jsdom and are off.
 */
import axe from 'axe-core';

export async function axeViolations(node: Element = document.body): Promise<string[]> {
  const result = await axe.run(node, {
    rules: {
      'color-contrast': { enabled: false },
      region: { enabled: false },
    },
  });
  return result.violations.map(
    (v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(', ')})`,
  );
}
