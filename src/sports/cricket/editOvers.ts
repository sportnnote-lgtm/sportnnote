/**
 * Cricket: edit a specific past ball (parity #06) — the PURE engine.
 *
 * Builds the over-by-over editor model from an effective event log, and turns
 * the scorer's edits into #05 AMEND ops (`replace` by seq). Every edit keeps
 * the ball's category (legal / wicket / wide / no-ball), so overs never
 * renumber; replaying the log after the ops recomputes totals, figures and the
 * crease (the engine's `alignCrease` honours each ball's recorded striker).
 *
 * No React Native imports — node tests load this file (note the `.ts`
 * extensions, as in engine.ts).
 */
import type { MatchEventRecord } from '../../core/types';
import type { ScoreAction } from '../types';
import { AMEND_TYPE, effectiveLog, type AmendOp } from '../amend.ts';
import { effectiveRules } from './rules.ts';
import { init, reducer, ballStamp, oversStr, alignCrease, NO_BOWLER, type CricketState, type DismissalKind } from './engine.ts';

// ─── Types ─────────────────────────────────────────────────────────────────

export type BallKind = 'legal' | 'wicket' | 'wide' | 'noball';

export interface EditableBall {
  seq: number;
  /** delivery notation, e.g. '2.3' (an extra shares the stamp of the next legal ball) */
  stamp: string;
  /** the engine's over-strip symbol, identical to `state.thisOver` entries:
   *  '0','1','4','6','b2','lb','W','1+W','wd','3wd','nb','2nb','wd+W','1nb+W'.
   *  Show '·' for '0' via `chipLabel(sym)`. */
  sym: string;
  category: BallKind;
  /** [strikerId, nonStrikerId] when this ball was bowled (after alignCrease) */
  crease: [string, string];
  /** the ball as recorded (payload `_attr2` lifted into `attribution2`) */
  action: ScoreAction;
  strikerName?: string;
}

export interface EditableOver {
  /** 1-based over number within the innings */
  n: number;
  bowler: { id: string; name: string };
  /** seq of the SET_BOWLER that opened this over (absent for logs without one) */
  setBowlerSeq?: number;
  /** batters who faced a ball in this over, in order of first appearance */
  batters: { id: string; name: string }[];
  /** chronological (first ball first) */
  balls: EditableBall[];
}

export interface EditableInnings {
  side: 'home' | 'away';
  /** 0 = first innings, 1 = second */
  inningsIx: number;
  /** '87/4 (11.3)' */
  header: string;
  /** newest first */
  overs: EditableOver[];
}

export interface BallEdit {
  runs?: number;
  type?: 'bat' | 'bye' | 'legbye';
  strikerId?: string;
  strikerName?: string;
  kind?: string;
  fielderId?: string;
  fielderName?: string;
  batterOut?: 'striker' | 'nonStriker' | string;
  extraKind?: 'wide' | 'noball';
  extraRuns?: number;
}

/** Optional context for `editBall`: the fielding side's keeper, needed only to
 *  credit a stumping when a wicket is changed TO stumped (the live UI reads it
 *  from state.keepers). Without it a new stumping gets no keeper credit. */
export interface BallEditContext {
  keeper?: { id: string; name: string };
}

type Attr = NonNullable<ScoreAction['attribution']>;
type Payload = Record<string, unknown>;

export const CATEGORY_HINT = 'To make it a wicket or a wide, undo back to that ball.';

// ─── Small helpers ─────────────────────────────────────────────────────────

const BALL_TYPES = new Set(['RUNS', 'BYES', 'LEGBYES', 'WICKET', 'EXTRA']);
const NO_DELIVERY = new Set(['retired', 'timedout']);
const DELIVERY_KINDS = new Set(['bowled', 'caught', 'lbw', 'stumped', 'runout', 'hitwicket']);

/** A stored row → the reducer action (same mapping as amend.ts / useLiveMatch),
 *  with the persisted `_attr2` lifted back into `attribution2`. */
export function recordToAction(rec: MatchEventRecord): ScoreAction {
  const { _attr2, ...payload } = (rec.payload ?? {}) as Payload & { _attr2?: Attr };
  const a: ScoreAction = { type: rec.type };
  if (rec.side) a.side = rec.side;
  if (rec.payload) a.payload = payload;
  if (rec.attribution) a.attribution = rec.attribution;
  if (_attr2) a.attribution2 = _attr2;
  return a;
}

/** Is this record a delivery that the editor lists (not retired/timed-out)? */
export function isEditableBall(rec: Pick<MatchEventRecord, 'type' | 'payload'>): boolean {
  if (!BALL_TYPES.has(rec.type)) return false;
  if (rec.type === 'WICKET' && NO_DELIVERY.has(String(rec.payload?.kind ?? 'bowled'))) return false;
  return true;
}

export function ballCategory(a: Pick<ScoreAction, 'type' | 'payload'>): BallKind {
  if (a.type === 'WICKET') return 'wicket';
  if (a.type === 'EXTRA') return a.payload?.kind === 'No ball' ? 'noball' : 'wide';
  return 'legal';
}

const num = (v: unknown, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

/** The over-strip symbol the engine writes for this ball (mirrors engine.ts). */
/** `widePenalty`: the wide value in force for this ball (#14 local rules; standard 1),
 *  so the chip matches the live over strip. */
export function ballSymbol(a: Pick<ScoreAction, 'type' | 'payload'>, widePenalty = 1): string {
  const p = a.payload ?? {};
  switch (a.type) {
    case 'RUNS': {
      const r = num(p.runs);
      return String(r);
    }
    case 'BYES':
    case 'LEGBYES': {
      const r = Math.max(1, num(p.runs, 1));
      return (a.type === 'LEGBYES' ? 'lb' : 'b') + (r > 1 ? r : '');
    }
    case 'WICKET': {
      const c = p.kind === 'runout' ? Math.max(0, num(p.runs)) : 0;
      return c > 0 ? `${c}+W` : 'W';
    }
    case 'EXTRA': {
      const nb = p.kind === 'No ball';
      if (p.runout) {
        const c = Math.max(0, num(p.runs));
        return `${c > 0 ? c : ''}${nb ? 'nb' : 'wd'}+W`;
      }
      if (nb) {
        const ran = Math.max(0, num(p.runs)) + Math.max(0, num(p.byes));
        return `${ran > 0 ? ran : ''}nb`;
      }
      const w = Math.max(0, num(p.runs));
      return w > 0 ? `${widePenalty + w}wd` : 'wd';
    }
    default:
      return '';
  }
}

/** Chip text: a dot ball reads '·'. */
export const chipLabel = (sym: string) => (sym === '0' ? '·' : sym);

/** Theme-free chip tone, matching index.tsx `overSymbolColor`
 *  (wicket → danger, boundary → primary, extra → accent, plain → surfaceAlt). */
export function overSymbolTone(sym: string): 'wicket' | 'boundary' | 'extra' | 'plain' {
  if (sym === 'W' || sym.endsWith('W')) return 'wicket';
  if (sym === '4' || sym === '6') return 'boundary';
  if (sym.endsWith('wd') || sym.endsWith('nb') || sym.startsWith('b') || sym.startsWith('lb')) return 'extra';
  return 'plain';
}

/** Runs conceded on a single ball, decoded from its symbol (same as index.tsx `ballRuns`). */
export function ballRuns(sym: string): number {
  if (sym.endsWith('nb')) return 1 + (parseInt(sym, 10) || 0);
  if (sym === 'wd') return 1;
  if (sym.startsWith('lb')) return parseInt(sym.slice(2), 10) || 1;
  if (sym.startsWith('b')) return parseInt(sym.slice(1), 10) || 1;
  if (sym.endsWith('W')) return parseInt(sym, 10) || 0;
  return parseInt(sym, 10) || 0;
}

/** Replay an effective log (no AMEND rows) through the cricket reducer. */
export function replayCricket(effLog: MatchEventRecord[], config?: Record<string, unknown>): CricketState {
  return effLog.reduce<CricketState>((s, e) => reducer(s, recordToAction(e)), init(config));
}

/** The effective log with `ops` applied — a preview of an AMEND before it's sent. */
export function applyOps(effLog: MatchEventRecord[], ops: AmendOp[]): MatchEventRecord[] {
  if (!ops.length) return effLog;
  const top = effLog.reduce((m, e) => Math.max(m, e.seq), 0);
  return effectiveLog([...effLog, { seq: top + 1, type: AMEND_TYPE, payload: { ops, lines: [], byName: '', deltas: [] } }]);
}

// ─── editableOvers ─────────────────────────────────────────────────────────

/** Walk the log once and record, for every record, the innings it belongs to
 *  (undefined for Super Over / tie-breaker records). */
function walk(effLog: MatchEventRecord[], config: Record<string, unknown> | undefined,
  visit: (rec: MatchEventRecord, pre: CricketState, post: CricketState, inningsIx: number | undefined) => void): CricketState {
  let s = init(config);
  for (const rec of effLog) {
    const pre = s;
    const inSuper = !!pre.superOver || rec.type === 'START_SUPER_OVER';
    s = reducer(s, recordToAction(rec));
    visit(rec, pre, s, inSuper ? undefined : pre.innings - 1);
  }
  return s;
}

/** The editor model: innings newest first, overs newest first, balls in order.
 *  Super Over balls, PENALTY and retired / timed-out "wickets" are not listed. */
export function editableOvers(effLog: MatchEventRecord[], config?: Record<string, unknown>): EditableInnings[] {
  const innings: (EditableInnings & { byN: Map<number, EditableOver> })[] = [];
  let pendingSetBowler: number | undefined;
  let bpo = 6;
  const final = walk(effLog, config, (rec, pre, post, ix) => {
    bpo = pre.ballsPerOver;
    if (ix === undefined) return;
    if (rec.type === 'SET_BOWLER') {
      if (post !== pre && post.bowlerId === String(rec.payload?.id ?? '')) pendingSetBowler = rec.seq;
      return;
    }
    if (!isEditableBall(rec) || post === pre) return;
    const side = pre.battingSide;
    let inn = innings.find((i) => i.inningsIx === ix);
    if (!inn) {
      inn = { side, inningsIx: ix, header: '', overs: [], byN: new Map() };
      innings.push(inn);
    }
    const action = recordToAction(rec);
    const p = action.payload ?? {};
    const legalBefore = pre.scores[side].balls;
    const n = Math.floor(legalBefore / pre.ballsPerOver) + 1;
    const aligned = alignCrease(pre, { strikerId: p.strikerId as string | undefined });
    const strikerId = (p.strikerId as string | undefined) ?? aligned.strikerId ?? '';
    const strikerName = (p.strikerId ? (p.strikerName as string | undefined) : undefined) ?? aligned.strikerName;
    const nonStrikerId = (strikerId === aligned.strikerId ? aligned.nonStrikerId : aligned.strikerId) ?? '';
    let over = inn.byN.get(n);
    if (!over) {
      const bId = String(p.bowlerId ?? pre.bowlerId ?? '');
      over = {
        n,
        bowler: { id: bId, name: String(p.bowlerName ?? pre.bowling[bId]?.name ?? pre.bowlerName ?? '') },
        batters: [],
        balls: [],
      };
      if (pendingSetBowler !== undefined) over.setBowlerSeq = pendingSetBowler;
      pendingSetBowler = undefined;
      inn.byN.set(n, over);
      inn.overs.push(over);
    }
    if (strikerId && !over.batters.some((b) => b.id === strikerId)) {
      over.batters.push({ id: strikerId, name: strikerName ?? pre.batting[strikerId]?.name ?? '' });
    }
    over.balls.push({
      seq: rec.seq,
      stamp: ballStamp(legalBefore + 1, pre.ballsPerOver),
      sym: ballSymbol(action, effectiveRules(pre).wideRuns),
      category: ballCategory(action),
      crease: [strikerId, nonStrikerId],
      action,
      strikerName: strikerName ?? (strikerId ? pre.batting[strikerId]?.name : undefined),
    });
  });
  for (const inn of innings) {
    const sc = final.scores[inn.side];
    inn.header = `${sc.runs}/${sc.wickets} (${oversStr(sc.balls, bpo)})`;
    inn.overs.reverse();
  }
  return innings
    .sort((a, b) => b.inningsIx - a.inningsIx)
    .map(({ byN: _byN, ...rest }) => rest);
}

// ─── editBall ──────────────────────────────────────────────────────────────

const cleanUndef = (p: Payload): Payload => {
  for (const k of Object.keys(p)) if (p[k] === undefined) delete p[k];
  return p;
};

/** Apply an Edit Ball form to a recorded ball. Spreads the ORIGINAL payload
 *  (later-spec keys like `boundary`, `runsAs`, `end`, `v` survive), keeps the
 *  category, and rebuilds attribution as index.tsx does. Non-ball actions
 *  (SET_RULES, ADJUST, SET_BOWLER, PENALTY, retired…) pass through unchanged. */
export function editBall(rec: MatchEventRecord, edit: BallEdit, ctx: BallEditContext = {}): ScoreAction | { error: string } {
  const orig = recordToAction(rec);
  if (!isEditableBall(rec)) return orig;
  const op = orig.payload ?? {};
  const cat = ballCategory(orig);
  const p: Payload = { ...op };

  // Who faced: the striker of the ball (one of the two batters at the crease).
  if (edit.strikerId !== undefined && edit.strikerId !== op.strikerId) {
    p.strikerId = edit.strikerId;
    p.strikerName = edit.strikerName ?? op.strikerName;
  }
  const strikerId = p.strikerId as string | undefined;
  const strikerName = p.strikerName as string | undefined;
  const bowlerId = p.bowlerId as string | undefined;
  const bowlerName = p.bowlerName as string | undefined;
  const wantsWicket = edit.kind !== undefined || edit.fielderId !== undefined || edit.batterOut !== undefined;

  if (cat === 'legal') {
    if (wantsWicket || edit.extraKind !== undefined || edit.extraRuns !== undefined) return { error: CATEGORY_HINT };
    const curType = orig.type === 'BYES' ? 'bye' : orig.type === 'LEGBYES' ? 'legbye' : 'bat';
    const t = edit.type ?? curType;
    const r = edit.runs ?? num(op.runs, t === 'bat' ? 0 : 1);
    if (!Number.isInteger(r) || r < 0 || r > 7) return { error: 'Runs must be 0–7.' };
    if (t !== 'bat' && r < 1) return { error: `A ${t === 'bye' ? 'bye' : 'leg bye'} needs at least 1 run.` };
    p.runs = r;
    const type = t === 'bat' ? 'RUNS' : t === 'bye' ? 'BYES' : 'LEGBYES';
    const a: ScoreAction = { type, payload: cleanUndef(p) };
    if (orig.side) a.side = orig.side;
    if (type === 'RUNS' && strikerId) a.attribution = { playerId: strikerId, stat: 'runs', by: r, playerName: strikerName };
    return a;
  }

  if (cat === 'wicket') {
    if (edit.type !== undefined || edit.extraKind !== undefined || edit.extraRuns !== undefined) return { error: CATEGORY_HINT };
    const kind = String(edit.kind ?? op.kind ?? 'bowled') as DismissalKind;
    if (!DELIVERY_KINDS.has(kind)) return { error: 'Retired hurt / timed out aren’t deliveries — undo back to that ball.' };
    const isRunOut = kind === 'runout';
    const needsFielder = kind === 'caught' || isRunOut;
    if (needsFielder) {
      const keepOld = edit.fielderId === undefined && (op.kind === 'caught' || op.kind === 'runout');
      p.fielderId = edit.fielderId ?? (keepOld ? op.fielderId : undefined);
      p.fielderName = edit.fielderId !== undefined ? edit.fielderName : keepOld ? op.fielderName : undefined;
      if (kind === 'caught' && !p.fielderId && !p.fielderName) return { error: 'Pick the fielder who took the catch.' };
    } else {
      p.fielderId = undefined;
      p.fielderName = undefined;
    }
    if (isRunOut) {
      const bo = edit.batterOut ?? op.batterOut ?? 'striker';
      p.batterOut = String(bo).toLowerCase() === 'nonstriker' ? 'nonstriker' : 'striker';
      const r = edit.runs ?? num(op.runs);
      if (!Number.isInteger(r) || r < 0 || r > 3) return { error: 'Run-out runs must be 0–3.' };
      p.runs = r;
    } else {
      if (edit.runs !== undefined && edit.runs !== 0) return { error: 'Only a run out can carry completed runs.' };
      p.batterOut = 'striker';
      p.runs = 0;
    }
    p.kind = kind;
    const fielderCredit = (): Attr | undefined => {
      if (kind === 'caught' && p.fielderId) return { playerId: p.fielderId as string, stat: 'catches', playerName: p.fielderName as string | undefined };
      if (kind === 'stumped') {
        if (ctx.keeper?.id) return { playerId: ctx.keeper.id, stat: 'stumpings', playerName: ctx.keeper.name };
        if (op.kind === 'stumped' && orig.attribution2) return orig.attribution2;
        return undefined;
      }
      if (isRunOut && p.fielderId) return { playerId: p.fielderId as string, stat: 'runouts', playerName: p.fielderName as string | undefined };
      return undefined;
    };
    const a: ScoreAction = { type: 'WICKET', payload: cleanUndef(p) };
    if (orig.side) a.side = orig.side;
    const attr = isRunOut ? fielderCredit() : bowlerId && !NO_BOWLER.includes(kind) ? { playerId: bowlerId, stat: 'wickets', by: 1, playerName: bowlerName } : undefined;
    const attr2 = isRunOut ? undefined : fielderCredit();
    if (attr) a.attribution = attr;
    if (attr2) a.attribution2 = attr2;
    return a;
  }

  // Extras: Wide ⇄ No ball, runs 0–4 (0–6 accepted so a recorded no-ball six survives).
  if (edit.type !== undefined || (edit.kind !== undefined && !(op.runout && edit.kind === 'runout'))) return { error: CATEGORY_HINT };
  if (!op.runout && (edit.fielderId !== undefined || edit.batterOut !== undefined)) return { error: CATEGORY_HINT };
  const ek = edit.extraKind ?? (cat === 'noball' ? 'noball' : 'wide');
  const switching = ek !== cat;
  let r = edit.extraRuns ?? edit.runs ?? num(op.runs);
  if (switching && ek === 'wide' && !op.runout && edit.extraRuns === undefined && edit.runs === undefined) r += num(op.byes);
  if (!Number.isInteger(r) || r < 0 || r > (ek === 'noball' ? 6 : 4)) return { error: ek === 'noball' ? 'No-ball runs must be 0–6.' : 'Wide runs must be 0–4.' };
  p.kind = ek === 'noball' ? 'No ball' : 'Wide';
  p.runs = r;
  if (ek === 'wide') delete p.byes; // a wide has no off-bat/bye split — all runs are wides
  if (op.runout) {
    const bo = edit.batterOut ?? op.batterOut ?? 'striker';
    p.batterOut = String(bo).toLowerCase() === 'nonstriker' ? 'nonstriker' : 'striker';
    if (edit.fielderId !== undefined) { p.fielderId = edit.fielderId; p.fielderName = edit.fielderName; }
    if (r > 3) return { error: 'Run-out runs must be 0–3.' };
  }
  const a: ScoreAction = { type: 'EXTRA', payload: cleanUndef(p) };
  if (orig.side) a.side = orig.side;
  if (op.runout) {
    if (p.fielderId) a.attribution = { playerId: p.fielderId as string, stat: 'runouts', playerName: p.fielderName as string | undefined };
  } else if (orig.attribution) {
    a.attribution = orig.attribution; // live extras carry none; keep anything a later spec added
  }
  return a;
}

// ─── remapPlayer ───────────────────────────────────────────────────────────

const remapAttr = (at: Attr | undefined, fromId: string, toId: string, toName: string): Attr | undefined =>
  at && at.playerId === fromId ? { ...at, playerId: toId, playerName: toName } : at;

/** Rewrite every reference to player `fromId` (payload `*Id`/`id` with its
 *  matching `*Name`/`name`, SET_* payloads, attribution, attribution2 and a
 *  stored `_attr2`) to `toId`/`toName`. All other keys (incl. `v`) are kept. */
export function remapPlayer(action: ScoreAction, fromId: string, toId: string, toName: string): ScoreAction {
  const out: ScoreAction = { ...action };
  if (action.payload) {
    const p: Payload = { ...action.payload };
    for (const k of Object.keys(p)) {
      if (p[k] !== fromId) continue;
      if (k === 'id') { p.id = toId; if ('name' in p || toName) p.name = toName; continue; }
      if (k.endsWith('Id')) {
        p[k] = toId;
        p[`${k.slice(0, -2)}Name`] = toName;
      }
    }
    if (p._attr2) p._attr2 = remapAttr(p._attr2 as Attr, fromId, toId, toName);
    out.payload = p;
  }
  if (action.attribution) out.attribution = remapAttr(action.attribution, fromId, toId, toName);
  if (action.attribution2) out.attribution2 = remapAttr(action.attribution2, fromId, toId, toName);
  return out;
}

// ─── changeBowlerOps / swapBattersOps ──────────────────────────────────────

const sameAction = (a: ScoreAction, b: ScoreAction) => JSON.stringify(a) === JSON.stringify(b);

/** Replace an over's bowler — 'over' (just over `overN`) or 'all' (every over
 *  the current bowler of `overN` bowled in this innings). Rewrites that
 *  bowler's balls in those overs plus the SET_BOWLER that opened each.
 *  Errors if the new bowler would bowl two overs in a row. */
export function changeBowlerOps(
  innings: EditableInnings, overN: number, bowler: { id: string; name: string },
  scope: 'over' | 'all', effLog: MatchEventRecord[],
): AmendOp[] | { error: string } {
  const over = innings.overs.find((o) => o.n === overN);
  if (!over) return { error: `Over ${overN} not found.` };
  const old = over.bowler;
  if (!bowler.id) return { error: 'Pick a bowler.' };
  if (old.id === bowler.id) return [];
  const targets = scope === 'all' ? innings.overs.filter((o) => o.bowler.id === old.id) : [over];
  const targetNs = new Set(targets.map((o) => o.n));
  const after = new Map(innings.overs.map((o) => [o.n, targetNs.has(o.n) ? bowler.id : o.bowler.id]));
  for (const o of [...targets].sort((a, b) => a.n - b.n)) {
    for (const adj of [o.n - 1, o.n + 1]) {
      if (after.get(adj) === bowler.id) return { error: `${bowler.name} bowled over ${adj} — can't bowl consecutive overs.` };
    }
  }
  const bySeq = new Map(effLog.map((e) => [e.seq, e]));
  const ops: AmendOp[] = [];
  for (const o of targets) {
    if (o.setBowlerSeq !== undefined) {
      const rec = bySeq.get(o.setBowlerSeq);
      if (rec && rec.payload?.id === old.id) {
        ops.push({ op: 'replace', seq: rec.seq, action: remapPlayer(recordToAction(rec), old.id, bowler.id, bowler.name) });
      }
    }
    for (const b of o.balls) {
      if (b.action.payload?.bowlerId !== old.id) continue;
      ops.push({ op: 'replace', seq: b.seq, action: remapPlayer(b.action, old.id, bowler.id, bowler.name) });
    }
  }
  return ops.sort((x, y) => x.seq - y.seq);
}

/** Swap ALL records of batters `a` and `b` in one innings (every id/name field
 *  and attribution), so runs, balls and dismissals trade places. */
export function swapBattersOps(
  effLog: MatchEventRecord[], inningsIx: number,
  a: { id: string; name: string }, b: { id: string; name: string },
  config?: Record<string, unknown>,
): AmendOp[] {
  if (!a.id || !b.id || a.id === b.id) return [];
  const TMP = '\u0000swap';
  const ops: AmendOp[] = [];
  walk(effLog, config, (rec, _pre, _post, ix) => {
    if (ix !== inningsIx) return;
    const orig = recordToAction(rec);
    let act = remapPlayer(orig, a.id, TMP, a.name);
    act = remapPlayer(act, b.id, a.id, a.name);
    act = remapPlayer(act, TMP, b.id, b.name);
    if (!sameAction(orig, act)) ops.push({ op: 'replace', seq: rec.seq, action: act });
  });
  return ops;
}

// ─── #05 change lines ──────────────────────────────────────────────────────

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const KIND_LABEL: Record<string, string> = {
  bowled: 'Bowled', caught: 'Caught', lbw: 'LBW', stumped: 'Stumped', runout: 'Run out', hitwicket: 'Hit wicket',
};

/** Short human text for one ball: '1 run', '4 runs', '2 byes', 'Leg bye',
 *  'Caught (Dev)', 'Run out (Dev) + 1 run', 'Wide', 'Wide + 2', 'No ball + 4'. */
export function describeBall(a: Pick<ScoreAction, 'type' | 'payload'>): string {
  const p = a.payload ?? {};
  switch (a.type) {
    case 'RUNS': return plural(num(p.runs), 'run');
    case 'BYES': { const r = Math.max(1, num(p.runs, 1)); return r === 1 ? 'Bye' : plural(r, 'bye'); }
    case 'LEGBYES': { const r = Math.max(1, num(p.runs, 1)); return r === 1 ? 'Leg bye' : plural(r, 'leg bye'); }
    case 'WICKET': {
      const k = String(p.kind ?? 'bowled');
      const f = (k === 'caught' || k === 'runout') && p.fielderName ? ` (${p.fielderName})` : '';
      const out = k === 'runout' && p.batterOut === 'nonstriker' ? ', non-striker' : '';
      const r = k === 'runout' ? num(p.runs) : 0;
      return `${KIND_LABEL[k] ?? 'Out'}${f}${out}${r > 0 ? ` + ${plural(r, 'run')}` : ''}`;
    }
    case 'EXTRA': {
      const base = p.kind === 'No ball' ? 'No ball' : 'Wide';
      const r = num(p.runs) + (p.kind === 'No ball' ? num(p.byes) : 0);
      return `${base}${r > 0 ? ` + ${r}` : ''}${p.runout ? ' + run out' : ''}`;
    }
    default: return a.type;
  }
}

/** "Ball 2.3: 1 run → 4 runs" (the striker is named on both sides when it changed). */
export function ballDiffLine(stamp: string, before: Pick<ScoreAction, 'type' | 'payload'>, after: Pick<ScoreAction, 'type' | 'payload'>): string {
  const who = (x: Pick<ScoreAction, 'payload'>) => (x.payload?.strikerName as string | undefined) ?? (x.payload?.strikerId as string | undefined) ?? '?';
  const strikerChanged = before.payload?.strikerId !== after.payload?.strikerId;
  const d = (x: Pick<ScoreAction, 'type' | 'payload'>) => `${describeBall(x)}${strikerChanged ? ` (${who(x)})` : ''}`;
  return `Ball ${stamp}: ${d(before)} → ${d(after)}`;
}

/** "Over 3 bowler: Arjun → Kabir" / "Overs 1, 3, 5 bowler: Arjun → Kabir". */
export function bowlerDiffLine(overs: number | number[], fromName: string, toName: string): string {
  const ns = (Array.isArray(overs) ? [...overs] : [overs]).sort((a, b) => a - b);
  return `${ns.length === 1 ? 'Over' : 'Overs'} ${ns.join(', ')} bowler: ${fromName} → ${toName}`;
}

/** "Swapped records: Ravi ⇄ Dev". */
export const swapDiffLine = (aName: string, bName: string) => `Swapped records: ${aName} ⇄ ${bName}`;

/** The three #05 line builders, grouped. */
export const diffLine = { ball: ballDiffLine, bowler: bowlerDiffLine, swap: swapDiffLine };
