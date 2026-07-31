/**
 * Support knowledge base — the self-serve answer layer.
 *
 * This is the FIRST thing a user with a question hits: a set of help articles
 * plus a small offline search over them, so the common questions are answered
 * instantly with no server and no AI call. When a live Claude endpoint is
 * configured (see `core/supportAI.ts`) these same articles are also handed to
 * the model as grounding; when it isn't, this module is the whole experience.
 *
 * Deliberately pure data + a pure `searchArticles()` — unit-tested, and reused
 * as the seed content for the onboarding articles/videos (workstream D).
 *
 * Keep answers short and task-shaped ("how do I…"), in the app's own vocabulary
 * (organizer/scorer, match, tournament, fixtures, squad).
 */

export type SupportCategory =
  | 'Getting started'
  | 'Live scoring'
  | 'Tournaments'
  | 'Teams & players'
  | 'Following & alerts'
  | 'Account';

export interface Article {
  id: string;
  title: string;
  category: SupportCategory;
  /** One-line answer shown in results before the reader opens the article. */
  summary: string;
  /** Full answer. Paragraphs separated by blank lines; "- " lines render as bullets. */
  body: string;
  /** Extra search terms a user might type that aren't already in the title/body. */
  keywords?: string[];
}

export const CATEGORY_ICON: Record<SupportCategory, string> = {
  'Getting started': '🚀',
  'Live scoring': '⏱️',
  Tournaments: '🏆',
  'Teams & players': '👥',
  'Following & alerts': '🔔',
  Account: '⚙️',
};

export const ARTICLES: Article[] = [
  {
    id: 'what-is-sportfolio',
    title: 'What is Sportfolio?',
    category: 'Getting started',
    summary: 'A live-scoring app for every sport — score a match, run a tournament, follow players.',
    keywords: ['about', 'overview', 'cricheroes', 'purpose'],
    body: `Sportfolio lets anyone score a match live and share it — like CricHeroes, but for every sport (football, cricket, basketball, kabaddi, tennis, badminton, volleyball and more).

You can:
- Score a match ball-by-ball or point-by-point, live, even offline.
- Run a full tournament: add teams, generate fixtures, and track standings.
- Follow players and teams and get alerts when they're playing.

The person we build for first is the organizer/scorer — the one running the game. Everything is designed to be fast to tap while a match is happening.`,
  },
  {
    id: 'score-first-match',
    title: 'Score your first match',
    category: 'Getting started',
    summary: 'Open a match, tap Start, then tap the scoring buttons as play happens.',
    keywords: ['begin', 'start scoring', 'new match', 'how to score'],
    body: `To score a match:
- Open the match from Home (any match marked "tap to score") or create one.
- On the Scoring tab, tap "Start the match" to begin the clock/innings.
- Tap the scoring controls as play happens — they're tailored to each sport (goals, runs, points, raids…).
- Made a mistake? Tap "Undo" to step back one action; tap again to keep rewinding.

Your taps are saved on the device instantly, so you never lose scoring even if the connection drops.`,
  },
  {
    id: 'friendly-match',
    title: 'Start a quick friendly match',
    category: 'Getting started',
    summary: 'Use the 🤝 button on Home to set up a one-off match between two teams.',
    keywords: ['friendly', 'casual', 'pickup', 'one-off', 'quick match'],
    body: `A friendly is a one-off match that isn't part of a tournament.

- Tap the 🤝 (handshake) button in the Home header.
- Pick the sport and the two teams (or create them on the spot).
- Choose the format, then schedule or start it right away.

Friendlies show up in your matches and count toward players' "friendly" stats, kept separate from official tournament stats.`,
  },
  {
    id: 'offline-scoring',
    title: 'Scoring offline & how syncing works',
    category: 'Live scoring',
    summary: 'Every tap is saved on your device and syncs automatically when you reconnect.',
    keywords: ['offline', 'no internet', 'sync', 'connection', 'data lost', 'saved'],
    body: `You can score with no internet at all. Every tap is written to your device first, then synced to the cloud in the background.

- Offline: a banner shows how many changes are saved locally. Keep scoring — nothing is lost.
- Back online: the saved changes sync automatically.
- If the banner says "Can't sync right now" (not offline, but sync keeps failing), your scoring is still safe on the device. Tap "Retry". If it keeps failing, contact support and mention the match.

Because the device holds the full record, closing the app or refreshing the page won't lose your match.`,
  },
  {
    id: 'undo-fix-mistake',
    title: 'Fix a scoring mistake',
    category: 'Live scoring',
    summary: 'Tap Undo to rewind the last action; keep tapping to go further back.',
    keywords: ['undo', 'mistake', 'wrong', 'revert', 'correct', 'edit score'],
    body: `Tap "Undo" on the Scoring tab to reverse the last action. Each tap steps back one more action, so you can rewind to any earlier point and re-enter it correctly.

Undo also reverses any player stats that action credited (a goal, a wicket, a raid point), so match and player records stay consistent.

For some sports you can also edit a recorded moment in place from the match timeline.`,
  },
  {
    id: 'set-lineup-squad',
    title: 'Set the matchday squad for a match',
    category: 'Live scoring',
    summary: 'Open the match, pick who starts and who is on the bench from the full squad.',
    keywords: ['lineup', 'playing 11', 'starting five', 'squad', 'bench', 'subs', 'players'],
    body: `Before or during a match you choose who's actually playing:

- On the match, open the squad/lineup for each team.
- Tap players to move them between Starting and Bench. A counter shows how many you've picked versus how many the format needs.
- Use "Fill starters" to auto-complete the starters, or "Copy last match's squad" to reuse your previous side.

If a player you need isn't in the squad, use "Add / invite a player" right there to add them.`,
  },
  {
    id: 'choose-format',
    title: 'Choose a format (T20, 5-a-side, 3x3…)',
    category: 'Live scoring',
    summary: 'Pick a preset when creating the match, or tap "Customize" to fine-tune the rules.',
    keywords: ['format', 'preset', 'overs', 'rules', 'variant', 'a-side', 'custom'],
    body: `When you create a match you pick a format preset for that sport — for example T20 / ODI / The Hundred for cricket, 11-a-side / Futsal / 5s for football, or 3x3 / 2v2 for basketball.

- Picking a preset sets all the underlying rules at once (overs, players per side, periods…).
- Tap "Customize this format" to reveal and tweak the individual rules.

If a format or rule you want isn't offered yet, contact support and tell us the sport and the variant — we track these requests.`,
  },
  {
    id: 'rain-dls',
    title: 'Rain-reduced overs (cricket / DLS)',
    category: 'Live scoring',
    summary: 'Use "Rain — reduce overs" and the target updates automatically.',
    keywords: ['rain', 'dls', 'duckworth', 'reduced overs', 'revised target', 'cricket'],
    body: `If rain shortens a limited-overs match, tap "Rain — reduce overs" on the cricket scorer and set the new overs.

The chasing side's target is revised automatically using a Duckworth-Lewis-Stern style resource calculation, so the score and target stay correct without any manual maths.

This is an approximation suitable for club/box cricket; it isn't the official ICC table.`,
  },
  {
    id: 'create-tournament',
    title: 'Create a tournament',
    category: 'Tournaments',
    summary: 'From Organize, create a tournament, add its sports, then add teams and fixtures.',
    keywords: ['tournament', 'league', 'competition', 'organize', 'event', 'create'],
    body: `To run a tournament:
- Go to the Organize tab and create a new tournament (name, sports, dates).
- Add the teams taking part.
- Generate fixtures (see "Generate fixtures & knockouts").
- Score each match as it's played — standings update automatically.`,
  },
  {
    id: 'generate-fixtures',
    title: 'Generate fixtures & knockouts',
    category: 'Tournaments',
    summary: 'Auto-create a round-robin or knockout draw from the teams you added.',
    keywords: ['fixtures', 'schedule', 'draw', 'round robin', 'knockout', 'bracket', 'groups'],
    body: `Once a tournament has its teams, open "Generate fixtures":
- Round-robin: everyone plays everyone once (or twice for home & away).
- Knockout: a single-elimination bracket, with byes handled automatically for odd numbers.

For knockouts you can set how a level match is decided (for example extra time then penalties, penalties straight away, or a draw stands) and it's applied to the generated matches.`,
  },
  {
    id: 'standings',
    title: 'See standings & stats',
    category: 'Tournaments',
    summary: 'Open a tournament and tap through to its standings table and stat leaders.',
    keywords: ['standings', 'table', 'points', 'leaderboard', 'stats', 'top scorer'],
    body: `Each tournament has a standings table and stat leaders, scoped to that tournament only.

- Open the tournament, then its sport section, to see the table and leaders.
- Standings update automatically as you score matches.

If a table looks wrong, check you're viewing the right tournament and that the finished matches were fully scored.`,
  },
  {
    id: 'add-players',
    title: 'Add or invite players',
    category: 'Teams & players',
    summary: 'Add a player by name/number anywhere you see "Add / invite a player".',
    keywords: ['add player', 'invite', 'register', 'roster', 'new player', 'phone number'],
    body: `You can add a player from a team's squad page, or directly on a match via "Add / invite a player".

- A player is identified by their phone number, so the same number is always the same person across teams and tournaments.
- If they're not on Sportfolio yet, adding them creates an invited entry you can score against immediately; they can claim it later by signing up with that number.`,
  },
  {
    id: 'join-team-code',
    title: 'Join a team with a code',
    category: 'Teams & players',
    summary: 'Settings → "Join a team with a code" to add yourself to a team you were invited to.',
    keywords: ['join', 'code', 'invite code', 'team invite'],
    body: `If someone gives you a team invite code:
- Go to Settings → "Join a team with a code".
- Enter the code to add yourself to that team.

You can also open an invite link directly, which fills the code in for you.`,
  },
  {
    id: 'follow-players',
    title: 'Follow players & teams',
    category: 'Following & alerts',
    summary: 'Follow from a profile or the Discover tab to keep their matches in your feed.',
    keywords: ['follow', 'following', 'subscribe', 'favourite', 'feed'],
    body: `Follow a player or team from their profile or the Discover tab. Their matches then appear in your Home feed, and you can get reminders before they play.

Manage everyone you follow from Settings → Following.`,
  },
  {
    id: 'match-reminders',
    title: 'Match reminders & notifications',
    category: 'Following & alerts',
    summary: 'Settings → Match reminders to choose how long before a game you get alerted.',
    keywords: ['reminder', 'notification', 'alert', 'notify', 'before match'],
    body: `Set reminders in Settings → Match reminders. Choose one or more lead times (for example 1 day, 1 hour, 15 minutes before).

Reminders fire for matches you play in and for players/teams you follow. Turn them all off by clearing the selection.`,
  },
  {
    id: 'change-timezone',
    title: 'Change your time zone',
    category: 'Account',
    summary: 'Settings → Time zone. Match times then display in your chosen zone.',
    keywords: ['timezone', 'time zone', 'time', 'gmt', 'ist', 'clock'],
    body: `All match times display in your chosen time zone (default India / IST). Change it in Settings → Time zone — handy when you travel, so a match abroad shows in your local time.`,
  },
  {
    id: 'verification',
    title: 'Age & guardian verification',
    category: 'Account',
    summary: 'Upload a proof ID from your profile; the support team reviews and approves it.',
    keywords: ['verify', 'verification', 'age', 'guardian', 'id', 'proof', 'minor', 'document'],
    body: `Verification confirms a player's date of birth (and, for under-18s, their parent/guardian) using a proof ID such as a birth certificate, school ID or passport.

- From your profile, open "Age & guardian verification" and upload the document.
- Our support team reviews it and marks the profile approved or rejected.

Only the support team sees the document; it isn't shown on your public profile.`,
  },
  {
    id: 'edit-profile',
    title: 'Edit your profile',
    category: 'Account',
    summary: 'Settings → Edit profile (or tap your photo) to change your details and sports.',
    keywords: ['edit profile', 'photo', 'name', 'details', 'change', 'sports'],
    body: `Update your details from Settings → Edit profile, or tap your profile photo to change it. You can edit your name, city, jersey number, the sports you play, and your contact details.`,
  },
];

/** Split a string into lowercase word tokens for matching. */
function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

// Very common words carry no signal — ignore them so "how do I" doesn't match
// every article equally.
const STOP = new Set([
  'the', 'and', 'for', 'you', 'your', 'how', 'can', 'what', 'why', 'when', 'where', 'who', 'does',
  'did', 'was', 'are', 'with', 'this', 'that', 'from', 'into', 'get', 'got', 'has', 'have', 'not',
  'but', 'all', 'any', 'out', 'now', 'app', 'want', 'need', 'about', 'them', 'they', 'its', 'our',
]);

export interface KBMatch {
  article: Article;
  score: number;
}

/** Pre-tokenized fields per article, computed once. */
interface Indexed {
  article: Article;
  title: string[];
  keywords: string[];
  summary: string[];
  body: string[];
  /** Every distinct term the article contains, for document-frequency counting. */
  all: Set<string>;
}

const INDEX: Indexed[] = ARTICLES.map((article) => {
  const title = tokenize(article.title);
  const keywords = (article.keywords ?? []).flatMap(tokenize);
  const summary = tokenize(article.summary);
  const body = tokenize(article.body);
  return { article, title, keywords, summary, body, all: new Set([...title, ...keywords, ...summary, ...body]) };
});

// Rarity weight per term: a word in few articles (e.g. "sync", "timezone")
// discriminates far better than one in many ("score", "match", "team"), so it
// should count for more. Classic inverse-document-frequency, clamped to ≥1 so a
// common word still contributes something.
function idf(term: string): number {
  let df = 0;
  for (const doc of INDEX) if (doc.all.has(term)) df++;
  if (df === 0) return 1;
  return Math.max(1, Math.log(INDEX.length / df) + 1);
}

/**
 * Rank articles against a free-text query. Pure and deterministic.
 *
 * Field hits weigh by position (title > keywords > summary > body) AND by term
 * rarity, so "my score won't sync" leads with the sync article rather than every
 * article that merely says "score". Returns matches sorted best-first.
 */
export function searchArticles(query: string, limit = 5): KBMatch[] {
  const terms = tokenize(query).filter((t) => !STOP.has(t));
  if (terms.length === 0) return [];

  const matches: KBMatch[] = INDEX.map(({ article, title, keywords, summary, body }) => {
    let score = 0;
    for (const term of terms) {
      const w = idf(term);
      if (title.includes(term)) score += 6 * w;
      if (keywords.includes(term)) score += 4 * w;
      if (summary.includes(term)) score += 2 * w;
      if (body.includes(term)) score += 1 * w;
      // Partial credit for prefixes ("tournam" → "tournament") on longer terms.
      if (term.length >= 4) {
        if (title.some((x) => x.startsWith(term))) score += 3 * w;
        if (keywords.some((x) => x.startsWith(term))) score += 2 * w;
      }
    }
    return { article, score };
  }).filter((m) => m.score > 0);

  matches.sort((a, b) => b.score - a.score);
  return matches.slice(0, limit);
}

/** Articles grouped by category, preserving declaration order — for browsing. */
export function articlesByCategory(): { category: SupportCategory; articles: Article[] }[] {
  const order: SupportCategory[] = [
    'Getting started', 'Live scoring', 'Tournaments', 'Teams & players', 'Following & alerts', 'Account',
  ];
  return order
    .map((category) => ({ category, articles: ARTICLES.filter((a) => a.category === category) }))
    .filter((g) => g.articles.length > 0);
}

export const getArticle = (id: string): Article | undefined => ARTICLES.find((a) => a.id === id);

/** Details we attach to an escalated case so a reply doesn't need a back-and-forth. */
export interface SupportCaseContext {
  question: string;
  /** What the user already saw (KB article titles / AI answer) before escalating. */
  triedSummary?: string;
  handle?: string;
  appVersion?: string;
}

/**
 * Build a `mailto:` link that opens the user's mail app pre-filled with their
 * question and the context support needs to answer without a round-trip. This is
 * the escalation path that works today with zero backend; phase 2 replaces it
 * with a server-recorded case + auto-email once an endpoint is configured. Pure
 * so it can be unit-tested and reused.
 */
export function buildSupportMailto(to: string, ctx: SupportCaseContext): string {
  const subject = `Sportfolio support: ${ctx.question.slice(0, 60)}${ctx.question.length > 60 ? '…' : ''}`;
  const lines = [
    ctx.question,
    '',
    '—',
    ctx.triedSummary ? `Already tried: ${ctx.triedSummary}` : '',
    ctx.handle ? `Account: @${ctx.handle}` : '',
    ctx.appVersion ? `App version: ${ctx.appVersion}` : '',
  ].filter(Boolean);
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join('\n'))}`;
}
