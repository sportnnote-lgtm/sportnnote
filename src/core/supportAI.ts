/** Optional LLM layer for support answers.
 *
 *  The knowledge base in `data/supportKB.ts` answers common questions instantly,
 *  offline, with no API call. This module is the *upgrade*: for a free-form
 *  question the KB can't cleanly answer, it asks the `support-assistant` Supabase
 *  Edge Function, which forwards the question — grounded in the best-matching KB
 *  articles — to Claude and returns a written answer plus whether it resolved.
 *
 *  ── Why a server function ──
 *  This is a React-Native client. The Anthropic key must never ship in the app,
 *  so we never call the API directly. The key lives as a Supabase secret and the
 *  edge function holds it (see `supabase/functions/support-assistant`). Until a
 *  Supabase project is configured (demo mode), `enabled()` is false and the app
 *  uses the knowledge base only. This mirrors `core/voiceLLM.ts`'s degrade path.
 *
 *  ── Server contract ──
 *  POST { question, context, appVersion? } → { answer, resolved }
 *  `context` is the KB text we already matched, so the model answers from our
 *  own docs rather than inventing product behaviour.
 */
import { supabase, isSupabaseConfigured } from './supabase';

/** AI answers are available only in live mode, where the edge function is deployed. */
export const enabled = (): boolean => isSupabaseConfigured;

export interface SupportAnswer {
  answer: string;
  /** The model's own read on whether this fully resolves the question. */
  resolved: boolean;
}

/** Ask the edge function for an AI answer grounded in the given KB context.
 *  Returns null on any failure (not configured, offline, error, function not
 *  deployed yet) so callers fall back to the knowledge base — the LLM is strictly
 *  additive, never required. */
export async function askSupport(
  question: string,
  context: string,
  appVersion?: string
): Promise<SupportAnswer | null> {
  if (!enabled() || !supabase) return null;
  try {
    const { data, error } = await supabase.functions.invoke('support-assistant', {
      body: { question, context, appVersion },
    });
    if (error) return null;
    const answer = typeof data?.answer === 'string' ? data.answer.trim() : '';
    if (!answer) return null;
    return { answer, resolved: data.resolved === true };
  } catch {
    return null;
  }
}
