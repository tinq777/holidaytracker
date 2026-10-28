/** Shared Claude call for the web-search features (hotel check, hotel suggestions, ideas). */
export class AIError extends Error {}

type Block = { type: string; text?: string };
interface Opts { apiKey: string; model: string; content: unknown[] | string; search: boolean; maxTokens: number; maxSearches?: number }

async function post(o: Opts, messages: unknown[], search: boolean) {
  let res: Response;
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': o.apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({ model: o.model, max_tokens: o.maxTokens, messages, ...(search ? { tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: o.maxSearches ?? 5 }] } : {}) })
    });
  } catch { throw new AIError('Couldn\'t reach Claude. Check your connection and try again.'); }
  if (!res.ok) {
    let detail = ''; try { detail = (await res.json())?.error?.message ?? ''; } catch { /* ignore */ }
    throw Object.assign(new AIError(
      res.status === 401 ? 'Your Anthropic API key was rejected. Check it in More → AI reading.' :
      res.status === 429 ? 'Too many AI requests in a short time. Wait a minute and try again.' :
      res.status === 529 || res.status >= 500 ? 'Claude is busy right now. Try again in a moment.' :
      `Claude returned an error (${res.status})${detail ? `: ${detail}` : ''}.`), { status: res.status });
  }
  return res.json() as Promise<{ content: Block[]; stop_reason: string }>;
}

/**
 * Sends one request, continuing if a long web search pauses the turn. If web search isn't available on the
 * account (a 400-type error), tries again without it. Returns the reply text and whether search was used.
 */
export async function askClaude(o: Opts): Promise<{ text: string; searched: boolean }> {
  const first = [{ role: 'user', content: o.content }];
  const run = async (search: boolean) => {
    let messages: unknown[] = first; let all: Block[] = [];
    for (let n = 0; n < 4; n++) {
      const data = await post(o, messages, search);
      all = [...all, ...(data.content ?? [])];
      if (data.stop_reason === 'pause_turn') { messages = [...first, { role: 'assistant', content: all }]; continue; }
      if (data.stop_reason === 'max_tokens') throw new AIError('The answer was too long and got cut off. Try again, or narrow it down (e.g. an area or fewer must-haves).');
      break;
    }
    return all.filter(b => b.type === 'text').map(b => b.text ?? '').join('');
  };
  if (!o.search) return { text: await run(false), searched: false };
  try { return { text: await run(true), searched: true }; }
  catch (e) {
    const st = (e as { status?: number }).status;
    if (st && st >= 400 && st < 500 && st !== 401 && st !== 429) return { text: await run(false), searched: false };
    throw e;
  }
}

/** Finds the JSON object in a reply (skipping any text or stray braces around it). Prefers one containing `key`. */
export function extractJSON(text: string, key?: string): Record<string, unknown> {
  const t = text.replace(/```json|```/g, '');
  const found: Record<string, unknown>[] = [];
  for (let i = t.indexOf('{'); i !== -1; i = t.indexOf('{', i + 1)) {
    let depth = 0, inStr = false, esc = false;
    for (let j = i; j < t.length; j++) {
      const ch = t[j];
      if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
      if (ch === '"') inStr = true; else if (ch === '{') depth++; else if (ch === '}' && --depth === 0) {
        try { const o = JSON.parse(t.slice(i, j + 1)); if (o && typeof o === 'object') found.push(o); } catch { /* not this one */ }
        break;
      }
    }
    if (found.length && (!key || key in found[found.length - 1])) return found[found.length - 1];
  }
  if (found.length) return found.sort((a, b) => JSON.stringify(b).length - JSON.stringify(a).length)[0];
  throw new AIError("Claude's answer couldn't be read. Try again.");
}
