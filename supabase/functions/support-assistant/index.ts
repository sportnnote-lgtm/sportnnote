/**
 * Edge Function: support-assistant
 * ------------------------------------------------------------------------
 * The AI layer of the in-app help centre. The client (`core/supportAI.ts`)
 * calls this with a user's free-form question plus the text of the best-matching
 * knowledge-base articles; this forwards it to Claude and returns a written
 * answer grounded ONLY in that context, plus a `resolved` flag.
 *
 * Why a server function: the Anthropic API key must never ship in the app.
 * It lives here as a Supabase secret and is read from the environment.
 *
 * Contract (matches core/supportAI.ts):
 *   POST { question: string, context: string, appVersion?: string }
 *     → 200 { answer: string, resolved: boolean }
 *
 * Deploy:  supabase functions deploy support-assistant
 * Secret:  supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
 *   (SUPABASE_URL / SUPABASE_ANON_KEY are injected automatically.)
 */
import Anthropic from 'npm:@anthropic-ai/sdk@0.68.0';

// Support answering is a short, grounded task — Opus 4.8 is the default; swap to
// 'claude-haiku-4-5' here if you prefer lower latency/cost for the support bot.
const MODEL = 'claude-opus-4-8';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const SYSTEM = [
  'You are the in-app support assistant for SportnNote, a live-scoring app for many sports',
  '(organizers/scorers run matches and tournaments). Answer the user\'s question using ONLY',
  'the provided Help context. Be concise, friendly, and task-shaped (tell them what to tap/do).',
  'If the context does not contain the answer, do NOT guess: set resolved to false and say a',
  'human from the support team will follow up. When the context fully answers it, set resolved',
  'to true. Never invent features, screens, or steps that are not in the context.',
].join(' ');

// Structured output so the client always gets a valid { answer, resolved } shape.
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    answer: { type: 'string', description: 'The answer to show the user, grounded in the Help context.' },
    resolved: { type: 'boolean', description: 'True only if the context fully answers the question.' },
  },
  required: ['answer', 'resolved'],
} as const;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return json({ error: 'ANTHROPIC_API_KEY not configured' }, 503);

  let body: { question?: unknown; context?: unknown; appVersion?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid JSON' }, 400);
  }
  const question = typeof body.question === 'string' ? body.question.trim() : '';
  const context = typeof body.context === 'string' ? body.context : '';
  if (!question) return json({ error: 'question is required' }, 400);

  const client = new Anthropic({ apiKey });
  try {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM,
      output_config: { format: { type: 'json_schema', schema: SCHEMA } },
      messages: [
        {
          role: 'user',
          content: `Help context:\n${context || '(no matching articles)'}\n\nUser question: ${question}`,
        },
      ],
    });
    const text = res.content.find((b) => b.type === 'text');
    const parsed = text && 'text' in text ? JSON.parse(text.text) : null;
    if (!parsed || typeof parsed.answer !== 'string') {
      return json({ answer: '', resolved: false });
    }
    return json({ answer: parsed.answer, resolved: parsed.resolved === true });
  } catch (e) {
    // Any model/parse failure → let the client fall back to the knowledge base.
    console.error('support-assistant error', e);
    return json({ error: 'assistant unavailable' }, 502);
  }
});
