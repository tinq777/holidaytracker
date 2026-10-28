/**
 * Cleans text that came back from AI with web search: removes citation markup such as
 * <cite index="21-4,21-5">…</cite> (keeping the words inside), any other stray tags,
 * and markdown bold/links, then tidies spacing.
 */
export function cleanText(s: string): string {
  return s
    .replace(/<\/?cite[^>]*>/gi, '')
    .replace(/<[^>]{1,80}>/g, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '$1')
    .replace(/\s+([.,;:!?])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Applies cleanText to every string inside a stored AI result (used to fix results saved before this cleanup). */
export function cleanDeep<T>(v: T): T {
  if (typeof v === 'string') return cleanText(v) as unknown as T;
  if (Array.isArray(v)) return v.map(cleanDeep) as unknown as T;
  if (v && typeof v === 'object' && !(v instanceof Blob)) {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) out[k] = k === 'url' || k === 'link' || k === 'thumb' || k === 'id' ? x : cleanDeep(x);
    return out as T;
  }
  return v;
}
