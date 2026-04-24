export function requireValue<T>(value: T | null | undefined, label: string): T {
  if (value === null || value === undefined) {
    throw new Error(`[renderer] ${label} is required`);
  }
  return value;
}

export function requireString(value: string | null | undefined, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`[renderer] ${label} is required`);
  }
  return value;
}
