/**
 * Scorer-reminder engine. Without a backend cron we approximate scheduled
 * pushes by polling: when the app opens or returns (and every 5 minutes) we check upcoming matches
 * and fire any reminder whose time window has arrived.
 *
 *  - If a match has NO scorer, its hosts (match hosts + tournament hosts) are
 *    nudged a day before, 3 hours before and 1 hour before kickoff. As soon as
 *    a scorer is assigned, the remaining nudges stop (the no-scorer branch is
 *    simply skipped on the next check).
 *  - Once a scorer IS assigned, that scorer gets prep reminders a day before
 *    and an hour before so they're ready and don't forget.
 *
 * `computeDueReminders` is pure (no I/O) so the windowing logic is testable.
 */
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { getUpcomingMatches, getTournaments, getOrganizations, getMatchSquadsMany, getTeamLeadersMany, getPlayers, getMyPlayerId } from './repos';
import { gatherReminderInputsWith, startReminderTicker, type ReminderInputs, type ReminderReads } from './reminderInputs';
import { reminderPrefsStore, shortByMinutes } from './reminderPrefs';
import { followStore } from './followStore';
import { notify, syncScheduledLocal } from '../core/notifications';
import { useAuth } from '../core/auth';
import { tournamentHostPlayerIds } from '../core/org';
import { ageOf } from '../core/age';
import type { Match, MatchSquads, Organization, Player, TeamLeadership, Tournament } from '../core/types';

const HOUR = 3600_000;
const MIN = 60_000;
export interface ReminderWindow { key: string; ms: number; label: string }

/** Turn a set of lead-time minutes into descending reminder windows (activeWindow
 *  expects largest→smallest so exactly one band is live at a time). */
export function windowsFromMinutes(mins: number[]): ReminderWindow[] {
  return [...new Set(mins)]
    .sort((a, b) => b - a)
    .map((m) => ({ key: `${m}m`, ms: m * MIN, label: shortByMinutes(m) }));
}

/** The player ids taking part on one side of a match: the matchday squad
 *  (starters + subs) if it's set, otherwise the team's explicit roster. */
export function playersInSide(m: Match, side: 'home' | 'away', squads?: MatchSquads): string[] {
  const sq = side === 'home' ? squads?.home : squads?.away;
  if (sq && (sq.starters.length || sq.subs.length)) return [...sq.starters, ...sq.subs];
  const team = side === 'home' ? m.homeTeam : m.awayTeam;
  return team.roster ?? [];
}

const HOST_WINDOWS: ReminderWindow[] = [
  { key: '1d', ms: 24 * HOUR, label: 'tomorrow' },
  { key: '3h', ms: 3 * HOUR, label: 'in 3 hours' },
  { key: '1h', ms: 1 * HOUR, label: 'in 1 hour' },
];
const SCORER_WINDOWS: ReminderWindow[] = [
  { key: '1d', ms: 24 * HOUR, label: 'tomorrow' },
  { key: '1h', ms: 1 * HOUR, label: 'in 1 hour' },
];

/** The single window whose band currently contains `remaining` (ms to kickoff),
 *  so exactly one reminder is active at a time (no late catch-up spam). */
export function activeWindow(remaining: number, windows: ReminderWindow[]): ReminderWindow | null {
  if (remaining <= 0) return null;
  for (let i = 0; i < windows.length; i++) {
    const upper = windows[i].ms;
    const lower = windows[i + 1]?.ms ?? 0;
    if (remaining <= upper && remaining > lower) return windows[i];
  }
  return null;
}

/** Everyone who should be reminded about a match: its own hosts plus its
 *  tournament's hosts — and if the tournament is org-hosted, every member of
 *  that organization (deduped). */
export function hostsFor(m: Match, tournaments: Tournament[], orgs: Organization[]): string[] {
  const tour = tournaments.find((t) => t.id === m.tournamentId);
  const tourHosts = tour ? tournamentHostPlayerIds(tour, orgs) : [];
  return Array.from(new Set([...(m.hostIds ?? []), ...tourHosts]));
}

export interface DueReminder { key: string; playerId: string; matchId?: string; title: string; body: string }

/** Once a player turns 18, their own mobile & email become compulsory (under-18s
 *  rely on their guardian's). Nudge any 18+ player who hasn't verified both —
 *  until they do, they can't add themselves to teams, tournaments or matches. */
export function computeContactReminders(players: Player[], sent: Set<string>): DueReminder[] {
  const due: DueReminder[] = [];
  for (const p of players) {
    const age = ageOf(p);
    if (age === undefined || age < 18) continue; // minors don't need their own contacts
    if (p.phoneVerified && p.emailVerified) continue; // already done
    const key = `adultcontact:${p.id}`;
    if (sent.has(key)) continue;
    due.push({
      key,
      playerId: p.id,
      title: '🎂 You\'re 18 — verify your contact details',
      body: 'Add and verify your own mobile & email. Until both are verified you can\'t add yourself to any team, tournament or match.',
    });
  }
  return due;
}

export function computeDueReminders(
  matches: Match[],
  tournaments: Tournament[],
  orgs: Organization[],
  leadersByTeam: Record<string, TeamLeadership>,
  squadsByMatch: Record<string, MatchSquads>,
  now: number,
  sent: Set<string>,
  /** each player's global default lead times (minutes); a tournament can override */
  globalLeadMinutes: number[] = [],
  /** when set, player reminders are limited to this player (demo: one shared feed) */
  viewerId?: string | null,
  /** player ids the viewer follows — used to nudge them before a followed player plays */
  followedPlayerIds?: Set<string>,
  /** id → display name, for naming the followed player in follower reminders */
  playerNameById?: Record<string, string>
): DueReminder[] {
  const due: DueReminder[] = [];
  for (const m of matches) {
    if (m.status === 'completed') continue;
    const start = new Date(m.startsAt).getTime();
    if (!isFinite(start)) continue;
    const remaining = start - now;
    if (remaining <= 0) continue; // already started / past
    const label = `${m.homeTeam.shortName} vs ${m.awayTeam.shortName}`;

    // Player reminders: everyone playing gets a heads-up before kickoff, on the
    // schedule the tournament set (or, failing that, each player's own default).
    const tour = tournaments.find((t) => t.id === m.tournamentId);
    const leadMins = tour?.reminderLeadMinutes ?? globalLeadMinutes;
    const playerWindow = leadMins.length ? activeWindow(remaining, windowsFromMinutes(leadMins)) : null;
    if (playerWindow) {
      for (const side of ['home', 'away'] as const) {
        const team = side === 'home' ? m.homeTeam : m.awayTeam;
        for (const pid of playersInSide(m, side, squadsByMatch[m.id])) {
          if (viewerId && pid !== viewerId) continue; // demo: only the signed-in player's own reminders
          const key = `player:${m.id}:${playerWindow.key}:${pid}`;
          if (sent.has(key)) continue;
          due.push({
            key,
            playerId: pid,
            matchId: m.id,
            title: `⏰ You play ${playerWindow.label} — ${label}`,
            body: `You're in ${team.name} for ${label}. Tap for match details.`,
          });
        }
      }
    }

    // Follower reminders: nudge the viewer before a player they follow takes the
    // field. Uses the viewer's own lead times (they chose when to hear about it).
    if (viewerId && followedPlayerIds?.size) {
      const followWindow = globalLeadMinutes.length ? activeWindow(remaining, windowsFromMinutes(globalLeadMinutes)) : null;
      if (followWindow) {
        const playing = new Set([
          ...playersInSide(m, 'home', squadsByMatch[m.id]),
          ...playersInSide(m, 'away', squadsByMatch[m.id]),
        ]);
        for (const pid of playing) {
          if (pid === viewerId) continue; // your own match is already a player reminder
          if (!followedPlayerIds.has(pid)) continue;
          const key = `follow:${m.id}:${followWindow.key}:${pid}`;
          if (sent.has(key)) continue;
          const name = playerNameById?.[pid] ?? 'A player you follow';
          due.push({
            key,
            playerId: pid, // deep-link to the followed player
            matchId: m.id,
            title: `⭐ ${name} plays ${followWindow.label}`,
            body: `${name} is in ${label}. Tap to follow the match live.`,
          });
        }
      }
    }

    // Squad reminders: each team's captain & vice-captain are nudged until their
    // matchday XI is set (independent of the scorer reminders below).
    for (const side of ['home', 'away'] as const) {
      const team = side === 'home' ? m.homeTeam : m.awayTeam;
      const squadSet = ((side === 'home' ? squadsByMatch[m.id]?.home : squadsByMatch[m.id]?.away)?.starters.length ?? 0) > 0;
      if (squadSet) continue;
      const leaders = leadersByTeam[team.id] ?? {};
      const recipients = [leaders.captainId, leaders.viceCaptainId].filter((x): x is string => !!x);
      if (!recipients.length) continue;
      const w = activeWindow(remaining, HOST_WINDOWS);
      if (!w) continue;
      for (const pid of recipients) {
        const key = `squad:${m.id}:${side}:${w.key}:${pid}`;
        if (sent.has(key)) continue;
        due.push({
          key,
          playerId: pid,
          matchId: m.id,
          title: `📋 Squad needed — ${team.name}`,
          body: `Set your matchday squad for ${label} — starts ${w.label}.`,
        });
      }
    }

    if (!m.scorerId) {
      const w = activeWindow(remaining, HOST_WINDOWS);
      if (!w) continue;
      for (const hid of hostsFor(m, tournaments, orgs)) {
        const key = `host:${m.id}:${w.key}:${hid}`;
        if (sent.has(key)) continue;
        due.push({
          key,
          playerId: hid,
          matchId: m.id,
          title: `⚠️ No scorer yet — ${label}`,
          body: `This match starts ${w.label} and still has no scorer. Tap to assign one.`,
        });
      }
    } else {
      const w = activeWindow(remaining, SCORER_WINDOWS);
      if (!w) continue;
      const key = `scorer:${m.id}:${w.key}:${m.scorerId}`;
      if (sent.has(key)) continue;
      due.push({
        key,
        playerId: m.scorerId,
        matchId: m.id,
        title: `🎯 You're scoring ${label}`,
        body: `Your match starts ${w.label}. Get ready to score from your device.`,
      });
    }
  }
  return due;
}

/** A future notification to schedule on-device so it fires even if the app is
 *  closed. `id` is stable so re-syncing replaces rather than duplicates. */
export interface ScheduledReminder { id: string; fireAt: number; title: string; body: string; playerId?: string; matchId?: string }

/**
 * The viewer's *personal* upcoming reminders as absolute fire-times — for
 * OS-level local scheduling (Phase E), so they arrive when the app is backgrounded
 * or closed. Unlike `computeDueReminders` (one active band, polled while open),
 * this emits every future window as its own dated notification.
 *
 * Scope: the reminders that matter to an individual — matches they play in,
 * players they follow, and matches they're scoring. Host/squad nudges stay on the
 * in-app polling path (organizer-facing, transient).
 */
export function computeScheduledReminders(
  matches: Match[],
  tournaments: Tournament[],
  squadsByMatch: Record<string, MatchSquads>,
  now: number,
  viewerId: string | null,
  globalLeadMinutes: number[],
  followedPlayerIds?: Set<string>,
  playerNameById?: Record<string, string>
): ScheduledReminder[] {
  const out: ScheduledReminder[] = [];
  if (!viewerId) return out;
  for (const m of matches) {
    if (m.status === 'completed') continue;
    const start = new Date(m.startsAt).getTime();
    if (!isFinite(start) || start <= now) continue;
    const label = `${m.homeTeam.shortName} vs ${m.awayTeam.shortName}`;
    const playing = new Set([
      ...playersInSide(m, 'home', squadsByMatch[m.id]),
      ...playersInSide(m, 'away', squadsByMatch[m.id]),
    ]);

    // You're playing: reminders on the tournament's schedule, or your own.
    if (playing.has(viewerId)) {
      const mins = tournaments.find((t) => t.id === m.tournamentId)?.reminderLeadMinutes ?? globalLeadMinutes;
      for (const w of windowsFromMinutes(mins)) {
        const fireAt = start - w.ms;
        if (fireAt > now) out.push({ id: `player:${m.id}:${w.key}:${viewerId}`, fireAt, title: `⏰ You play ${w.label} — ${label}`, body: `You're in this match. Tap for details.`, matchId: m.id, playerId: viewerId });
      }
    }

    // Someone you follow is playing: on your own lead times.
    if (followedPlayerIds?.size) {
      for (const pid of playing) {
        if (pid === viewerId || !followedPlayerIds.has(pid)) continue;
        const name = playerNameById?.[pid] ?? 'A player you follow';
        for (const w of windowsFromMinutes(globalLeadMinutes)) {
          const fireAt = start - w.ms;
          if (fireAt > now) out.push({ id: `follow:${m.id}:${w.key}:${pid}`, fireAt, title: `⭐ ${name} plays ${w.label}`, body: `${name} is in ${label}.`, matchId: m.id, playerId: pid });
        }
      }
    }

    // You're the assigned scorer: get-ready nudges a day and an hour before.
    if (m.scorerId && m.scorerId === viewerId) {
      for (const w of windowsFromMinutes([1440, 60])) {
        const fireAt = start - w.ms;
        if (fireAt > now) out.push({ id: `scorer:${m.id}:${w.key}:${viewerId}`, fireAt, title: `🎯 You're scoring ${label}`, body: `Get ready to score — starts ${w.label}.`, matchId: m.id, playerId: viewerId });
      }
    }
  }
  return out;
}

// Reminders already delivered this session (keeps each window firing once).
const sent = new Set<string>();

/** The live/demo reads behind gatherReminderInputsWith (reminderInputs.ts). */
const reminderReads: ReminderReads = {
  upcomingMatches: (now) => getUpcomingMatches(now),
  tournaments: () => getTournaments(),
  organizations: () => getOrganizations(),
  teamLeaders: (ids) => getTeamLeadersMany(ids),
  matchSquads: (ids) => getMatchSquadsMany(ids),
  players: () => getPlayers(),
  // The viewer's followed players (follow keys look like "player:<id>") who
  // still want "Before they play" reminders (#23 alert choices).
  followedPlayerIds: () => new Set(
    followStore.getSnapshot().filter((k) => k.startsWith('player:')).map((k) => k.slice('player:'.length))
      .filter((id) => followStore.wants('player', id, 'reminder')),
  ),
};

/** Fetch everything the reminder computations need, once, so the "due now" (feed)
 *  and "schedule ahead" (OS) passes share the same snapshot. */
function gatherReminderInputs(now: number): Promise<ReminderInputs> {
  return gatherReminderInputsWith(reminderReads, now);
}

/** `inputs`: a snapshot already gathered this tick (shared with syncDeviceReminders). */
export async function runReminderCheck(now: number = Date.now(), viewerId?: string | null, inputs?: ReminderInputs): Promise<number> {
  const g = inputs ?? await gatherReminderInputs(now);
  const due = computeDueReminders(
    g.matches, g.tournaments, g.orgs, g.leadersByTeam, g.squadsByMatch, now, sent,
    reminderPrefsStore.get(), viewerId, g.followedPlayerIds, g.playerNameById,
  );
  // Adult contact-verification nudges (turned 18 without own verified mobile/email).
  due.push(...computeContactReminders(g.players, sent));
  for (const r of due) {
    sent.add(r.key);
    void notify({ title: r.title, body: r.body, playerId: r.playerId, matchId: r.matchId });
  }
  return due.length;
}

/** Phase E: schedule the viewer's upcoming personal reminders as dated OS
 *  notifications so they arrive even when the app is closed. No-op on web. */
export async function syncDeviceReminders(now: number = Date.now(), viewerId?: string | null, inputs?: ReminderInputs): Promise<number> {
  if (!viewerId) return 0;
  const g = inputs ?? await gatherReminderInputs(now);
  const scheduled = computeScheduledReminders(
    g.matches, g.tournaments, g.squadsByMatch, now, viewerId,
    reminderPrefsStore.get(), g.followedPlayerIds, g.playerNameById,
  );
  await syncScheduledLocal(scheduled);
  return scheduled.length;
}

// Dev aid: expose the pure windowing logic so it can be inspected in the web
// preview / unit-tested deterministically with a fixed `now`.
(globalThis as unknown as Record<string, unknown>).__sportfolioReminders = {
  computeDueReminders,
  computeScheduledReminders,
  activeWindow,
  hostsFor,
  windowsFromMinutes,
  playersInSide,
};

/** First check a few seconds after launch, so Home's own reads go first (F-08b). */
export const REMINDER_FIRST_DELAY_MS = 10_000;
/** Then every 5 minutes while the app is open (F-08e, founder-approved Q3 — was 60 s). */
export const REMINDER_INTERVAL_MS = 5 * 60_000;
/** Coming back to the app re-checks, but not more than once a minute. */
export const REMINDER_RESUME_GAP_MS = 60_000;

/** Run the reminder check shortly after the app opens, every 5 minutes, and when
 *  it returns to the foreground, while signed in. Resolves the signed-in player
 *  so player reminders in the shared demo feed are theirs only. Each tick
 *  gathers the data ONCE for both passes (F-08a). */
export function useReminderEngine() {
  const { profile } = useAuth();
  useEffect(() => {
    const viewer = getMyPlayerId(profile?.id).catch(() => null);
    const ticker = startReminderTicker(async () => {
      const viewerId = await viewer;
      const now = Date.now();
      const g = await gatherReminderInputs(now);
      await Promise.all([
        runReminderCheck(now, viewerId, g),       // in-app feed (while open)
        syncDeviceReminders(now, viewerId, g),    // OS notifications ahead of time (native; no-op on web)
      ]);
    }, { firstDelayMs: REMINDER_FIRST_DELAY_MS, intervalMs: REMINDER_INTERVAL_MS, minGapMs: REMINDER_RESUME_GAP_MS });
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') ticker.kick(); });
    return () => { sub.remove(); ticker.stop(); };
  }, [profile?.id]);
}
