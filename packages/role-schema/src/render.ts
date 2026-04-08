export interface RenderContext {
  company: { name: string; mission: string; values: string[] };
  employee: { name: string; title: string };
  team: { manager: string; reports: string[] };
  today: string;
  cwd: string;
}

type RenderOptions = { returnUnresolved?: boolean };

const VAR_RE = /\{\{\s*([a-zA-Z_][\w.]*)\s*\}\}/g;

function resolvePath(obj: unknown, path: string): string | undefined {
  const parts = path.split('.');
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur && typeof cur === 'object' && p in cur) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return undefined;
    }
  }
  if (Array.isArray(cur)) return cur.join(', ');
  if (cur === null || cur === undefined) return undefined;
  return String(cur);
}

export function renderRoleBody(body: string, ctx: RenderContext): string;
export function renderRoleBody(
  body: string,
  ctx: RenderContext,
  opts: { returnUnresolved: true },
): { output: string; unresolved: string[] };
export function renderRoleBody(body: string, ctx: RenderContext, opts?: RenderOptions) {
  const unresolved: string[] = [];
  const output = body.replace(VAR_RE, (match, path: string) => {
    const value = resolvePath(ctx, path);
    if (value === undefined) {
      unresolved.push(path);
      return match;
    }
    return value;
  });
  if (opts?.returnUnresolved) return { output, unresolved };
  return output;
}
