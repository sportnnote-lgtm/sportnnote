/** Optional LLM layer for support answers.
 *
 *  The knowledge base in `data/supportKB.ts` answers common questions instantly,
 *  offline, with no API call. This module is the *upgrade*: for a free-form
 *  question the KB can't cleanly answer, it sends the question — grounded in the
 *  best-matching articles — to a server proxy that forwards to Claude and returns
 *  a written answer plus whether the model believes it resolved the issue.
 *
 *  ── Why a proxy, not a direct call ──
 *  This is a React-Native client. Embedding an Anthropic API key in the app would
 *  leak it to every user, so we never call the API directly. Point `ENDPOINT` at a
 *  Supabase Edge Function you control (`supabase/functions/support-assistant`)
 *  that holds the key. Until an endpoint is set, `enabled()` is false and the app
 *  uses the knowledge base only — which is how the offline demo runs. This mirrors
 *  `core/voiceLLM.ts` exactly.
 *
 *  ── Server contract ──
 *  POST { question, context: string, appVersion?: string }
 *    → 200 { answer: string, resolved: boolean }
 *  `context` is the KB text we already matched, so the model answers from our
 *  own docs rather than inventing product behaviour.
 *
 *  ── Reference server call (Deno edge fn, @anthropic-ai/sdk) — see phase 2 ──
 *    model: 'claude-opus-4-8' (haiku is fine for latency),
 *    structured output { answer: string, resolved: boolean },
 *    system: answer ONLY from the provided Sportfolio help context; if the
 *    context doesn't cover it, set resolved:false and say a human will follow up.
 */

/** Set this to your proxy URL to enable AI support answers. Empty = KB only. */
const ENDPOINT = '';

export const enabled = (): boolean => ENDPOINT.length > 0;

export interface SupportAnswer {
  answer: string;
  /** The model's own read on whether this fully resolves the question. */
  resolved: boolean;
}

/** Ask the proxy for an AI answer grounded in the given KB context.
 *  Returns null on any failure (offline, error, not configured) so callers fall
 *  back to the knowledge base — the LLM is strictly additive, never required. */
export async function askSupport(
  question: string,
  context: string,
  appVersion?: string
): Promise<SupportAnswer | null> {
  if (!enabled()) return null;
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, context, appVersion }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { answer?: unknown; resolved?: unknown };
    const answer = typeof data.answer === 'string' ? data.answer.trim() : '';
    if (!answer) return null;
    return { answer, resolved: data.resolved === true };
  } catch {
    return null;
  }
}
