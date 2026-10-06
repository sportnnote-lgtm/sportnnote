/**
 * Edge Function: weekly-report
 * ------------------------------------------------------------------------
 * Every Monday morning (pg_cron, see docs/analytics.md), email the founder the
 * pilot's numbers for the last full week (Mon–Sun, IST): the KPI views from
 * migration 0029, matches per sport, activation, scorer retention, crash-free
 * sessions, top errors, and every piece of feedback/support received.
 *
 * Auth: `x-cron-secret: <CRON_SECRET>` (the cron job) or the service-role key.
 *   POST {}            → sends the email, returns { sent, text }
 *   POST { dry: true } → returns the text without emailing
 * Secrets: CRON_SECRET, RESEND_API_KEY, SUPPORT_EMAIL (recipient).
 */
import { admin, CORS, json, safeEqual, sendEmail, SERVICE_KEY } from '../_shared/guard.ts';

const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? '';
const TO = Deno.env.get('SUPPORT_EMAIL') ?? 'sportnnote@gmail.com';

function authorised(req: Request): boolean {
  const bearer = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (SERVICE_KEY && bearer && safeEqual(bearer, SERVICE_KEY)) return true;
  const cron = req.headers.get('x-cron-secret') ?? '';
  return !!CRON_SECRET && !!cron && safeEqual(cron, CRON_SECRET);
}

type Row = Record<string, unknown>;
const num = (v: unknown) => Number(v ?? 0);
const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)}%` : '—');
const delta = (now: number, before: number) => {
  if (!before) return now ? ' (new)' : '';
  const d = now - before;
  return d === 0 ? ' (=)' : ` (${d > 0 ? '+' : ''}${d})`;
};

/** Monday (IST) of the week that just ended, as YYYY-MM-DD. */
function lastWeekStart(): string {
  const ist = new Date(Date.now() + 5.5 * 3600_000);
  const dow = (ist.getUTCDay() + 6) % 7; // Mon=0
  ist.setUTCDate(ist.getUTCDate() - dow - 7);
  return ist.toISOString().slice(0, 10);
}
const addDays = (d: string, n: number) => {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};

async function build(): Promise<{ subject: string; text: string }> {
  const week = lastWeekStart();
  const prev = addDays(week, -7);
  const end = addDays(week, 7);
  // IST week window in UTC for raw tables.
  const fromUtc = new Date(`${week}T00:00:00+05:30`).toISOString();
  const toUtc = new Date(`${end}T00:00:00+05:30`).toISOString();

  const [weekly, sports, activation, retention, crash, errors, cases] = await Promise.all([
    admin.from('kpi_weekly').select('*').in('week', [week, prev]),
    admin.from('kpi_sport_weekly').select('*').eq('week', week),
    admin.from('kpi_activation').select('*').order('signup_week', { ascending: false }).limit(4),
    admin.from('kpi_scorer_retention').select('*').order('cohort', { ascending: false }).limit(8),
    admin.from('kpi_crash_free').select('*').gte('day', week).lt('day', end),
    admin.from('errors_top').select('message, occurrences, users, any_fatal, last_screen, platforms').limit(5),
    admin.from('support_cases').select('question, tried, handle, app_version, created_at').gte('created_at', fromUtc).lt('created_at', toUtc).order('created_at'),
  ]);

  const w = (weekly.data ?? []).find((r: Row) => r.week === week) ?? {};
  const p = (weekly.data ?? []).find((r: Row) => r.week === prev) ?? {};
  const line = (label: string, key: string) => `  ${label.padEnd(24)} ${num(w[key])}${delta(num(w[key]), num(p[key]))}`;

  const sessions = (crash.data ?? []).reduce((a: number, r: Row) => a + num(r.sessions), 0);
  const crashed = (crash.data ?? []).reduce((a: number, r: Row) => a + num(r.crashed), 0);
  // Retention cohort that has had 4 full weeks to come back.
  const cohort4 = addDays(week, -28);
  const ret = (retention.data ?? []).find((r: Row) => r.cohort === cohort4);
  const act = (activation.data ?? []).find((r: Row) => r.signup_week === week);

  const feedback = (cases.data ?? []) as Row[];
  const out: string[] = [
    `SportnNote — pilot report, week of ${week} (Mon–Sun IST)`,
    '',
    'PILOT KPIs (vs previous week)',
    line('Weekly active organisers', 'active_organisers'),
    line('Matches completed', 'matches_completed'),
    line('Golf rounds completed', 'golf_rounds_completed'),
    `  ${'4-week scorer retention'.padEnd(24)} ${ret ? `${num(ret.retained_week4)}/${num(ret.scorers)} (${pct(num(ret.retained_week4), num(ret.scorers))}) — cohort of ${cohort4}` : 'not enough history yet'}`,
    '',
    'GROWTH & USAGE',
    line('Sign-ups', 'sign_ups'),
    `  ${'Activated within 7 days'.padEnd(24)} ${act ? `${num(act.activated_7d)}/${num(act.sign_ups)} (${pct(num(act.activated_7d), num(act.sign_ups))})` : '—'}`,
    line('Active users', 'active_users'),
    line('Active scorers', 'active_scorers'),
    line('Tournaments created', 'tournaments_created'),
    line('Messages sent', 'messages_sent'),
    '',
    'BY SPORT (completed)',
    ...((sports.data ?? []) as Row[]).length
      ? ((sports.data ?? []) as Row[]).map((r) => `  ${String(r.sport ?? '?').padEnd(14)} ${num(r.matches_completed) + num(r.rounds_completed)}`)
      : ['  none this week'],
    '',
    'STABILITY',
    `  Crash-free sessions      ${sessions ? `${pct(sessions - crashed, sessions)} of ${sessions}` : 'no sessions recorded'}`,
    ...((errors.data ?? []) as Row[]).length
      ? ['  Top errors (14 days):', ...((errors.data ?? []) as Row[]).map((e) => `   • ${num(e.occurrences)}× / ${num(e.users)} users${e.any_fatal ? ' [CRASH]' : ''} — ${String(e.message).slice(0, 110)}${e.last_screen ? ` (on ${e.last_screen})` : ''}`)]
      : ['  No errors reported in the last 14 days.'],
    '',
    `FEEDBACK & SUPPORT (${feedback.length})`,
    ...(feedback.length
      ? feedback.map((c) => `  • ${String(c.question).slice(0, 300)}${c.handle ? ` — @${c.handle}` : ''}${c.tried ? `\n    ${String(c.tried).slice(0, 160)}` : ''}`)
      : ['  None this week.']),
    '',
    'Details: Supabase → SQL editor → select * from kpi_weekly; (see docs/analytics.md)',
  ];
  return { subject: `SportnNote weekly — ${num(w.matches_completed)} matches, ${num(w.sign_ups)} sign-ups, ${feedback.length} feedback`, text: out.join('\n') };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  if (!authorised(req)) return json({ error: 'forbidden' }, 403);
  const body = await req.json().catch(() => ({})) as { dry?: boolean };
  try {
    const { subject, text } = await build();
    if (body.dry) return json({ sent: false, subject, text });
    const sent = await sendEmail(TO, subject, text);
    return json({ sent, subject, text });
  } catch (e) {
    console.error('weekly-report', e);
    return json({ error: 'report failed' }, 500);
  }
});
