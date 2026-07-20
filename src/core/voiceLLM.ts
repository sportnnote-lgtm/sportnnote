/** Optional LLM layer for natural-language voice commands.
 *
 *  The deterministic grammar in `sports/football/voiceCommands.ts` handles the
 *  fixed command set fast and offline. This module is the *fallback* for free-form
 *  phrasing ("Kane just buried the penalty after rounding the keeper"): it sends
 *  the transcript to a server proxy that forwards to Claude and returns a single
 *  canonical command string the grammar already understands (e.g. "goal Kane
 *  penalty"). The grammar then drives the flow as usual — so the LLM only has to
 *  classify, never to act, and a mis-read can't fabricate a card on its own.
 *
 *  ── Why a proxy, not a direct call ──
 *  This is a React-Native client. Embedding an Anthropic API key in the app would
 *  leak it to every user, so we never call the API directly. Point `endpoint` at a
 *  small server you control (e.g. a Supabase Edge Function) that holds the key and
 *  makes the Claude call. Until an endpoint is configured, `enabled()` is false and
 *  the app uses the grammar only — which is how the offline demo runs.
 *
 *  ── Server contract ──
 *  POST { text, teams: {home, away}, players: string[] }
 *    → 200 { command: string }   // one canonical command, or "" if none
 *
 *  ── Reference server call (Node, @anthropic-ai/sdk) ──
 *    import Anthropic from '@anthropic-ai/sdk';
 *    const client = new Anthropic();                 // ANTHROPIC_API_KEY from env
 *    const res = await client.messages.create({
 *      model: 'claude-opus-4-8',                     // skill default; haiku is fine for latency
 *      max_tokens: 200,
 *      thinking: { type: 'adaptive' },
 *      output_config: {                              // structured output → guaranteed shape
 *        format: { type: 'json_schema', schema: {
 *          type: 'object', additionalProperties: false,
 *          properties: { command: { type: 'string' } }, required: ['command'],
 *        } },
 *      },
 *      system:
 *        'Translate a football scorer\'s spoken phrase into ONE canonical command for a ' +
 *        'rule-based parser. Vocabulary: goal|own goal|yellow card|red card|corner|foul|' +
 *        'offside|save|shot|tackle|interception|substitution|attacking play|defensive play|' +
 *        'kick off|end half|full time, optionally followed by a team name, a player name/' +
 *        'number, and a goal type (penalty|free kick|header|open play). If nothing matches, ' +
 *        'return an empty string. Return JSON {"command": "..."} only.',
 *      messages: [{ role: 'user', content:
 *        `Teams: ${teams.home} vs ${teams.away}. Players: ${players.join(', ')}. Phrase: "${text}"` }],
 *    });
 *    // res.content[0].text is the JSON; parse and return { command }.
 */

/** Set this to your proxy URL to enable natural-language parsing. Empty = grammar only. */
const ENDPOINT = '';

export const enabled = (): boolean => ENDPOINT.length > 0;

export interface VoiceContext {
  teams: { home: string; away: string };
  players: string[];
}

/** Ask the proxy to normalise a free-form phrase to a canonical command.
 *  Returns null on any failure (offline, error, not configured) so callers fall
 *  back to the deterministic grammar — the LLM is strictly additive. */
export async function normalizeCommand(text: string, ctx: VoiceContext): Promise<string | null> {
  if (!enabled()) return null;
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, teams: ctx.teams, players: ctx.players }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { command?: unknown };
    const cmd = typeof data.command === 'string' ? data.command.trim() : '';
    return cmd ? cmd : null;
  } catch {
    return null;
  }
}
