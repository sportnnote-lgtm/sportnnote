/**
 * Pro-Kabaddi scoring model — pure & replay-based.
 *
 * A raid's outcome (defenders touched, bonus, raider tackled) drives points AND
 * the out-count of players on the mat. Deriving the whole match state by replaying
 * the raid list keeps undo/edit trivially correct (drop a raid → recompute).
 *
 * Revival styles:
 *   • sanjeevani — putting an opponent out revives one of your own out players;
 *     an all-out gives +2 and the emptied side revives everyone.
 *   • amar       — nobody leaves the mat; points only (no out-count, super tackle
 *     or all-out apply).
 *   • gaminee    — no revival; an all-out ends the match.
 *
 * Pro rules (when enabled): super tackle (+2 when ≤3 defenders remain) and
 * do-or-die (a 3rd consecutive empty raid that scores nothing puts the raider out).
 */
export type KabaddiStyle = 'sanjeevani' | 'amar' | 'gaminee';
export type Side = 'home' | 'away';

export interface RaidOutcome {
  side: Side;
  /** defenders touched — each goes out; also the raid points scored */
  touches: number;
  /** bonus-line point (raider must return safely) */
  bonus: boolean;
  /** the raider was tackled (caught) — the defence scores, the raider goes out */
  raiderOut: boolean;
}

export interface KabaddiCfg { teamSize: number; style: KabaddiStyle; proRules: boolean }

export interface KabaddiDerived {
  home: number;
  away: number;
  /** players currently OUT (off the mat) per side */
  out: { home: number; away: number };
  /** consecutive empty raids per side (3rd is do-or-die) */
  emptyRaids: { home: number; away: number };
  /** an all-out ended the match (gaminee) */
  allOutEnded: boolean;
}

const other = (s: Side): Side => (s === 'home' ? 'away' : 'home');

/** Fold a raid list into the full derived match state. */
export function replayRaids(raids: RaidOutcome[], cfg: KabaddiCfg): KabaddiDerived {
  const amar = cfg.style === 'amar';
  const score = { home: 0, away: 0 };
  const out = { home: 0, away: 0 };
  const emptyRaids = { home: 0, away: 0 };
  let allOutEnded = false;

  for (const r of raids) {
    if (allOutEnded) break;
    const opp = other(r.side);
    const raidPts = r.touches + (r.bonus ? 1 : 0);

    // Do-or-die: a 3rd straight empty raid that fails ⇒ the raider is out.
    const isDoOrDie = cfg.proRules && emptyRaids[r.side] >= 2;
    let raiderOut = r.raiderOut;
    if (isDoOrDie && raidPts === 0 && !raiderOut) raiderOut = true;

    // Raid points + defenders sent out (+ raiding side's revival).
    score[r.side] += raidPts;
    if (!amar && r.touches > 0) {
      out[opp] = Math.min(cfg.teamSize, out[opp] + r.touches);
      if (cfg.style === 'sanjeevani') out[r.side] = Math.max(0, out[r.side] - r.touches);
    }

    // Raider tackled ⇒ defence scores (super tackle when short-handed) + raider out.
    if (raiderOut) {
      const defendersOnMat = cfg.teamSize - (amar ? 0 : out[opp]);
      const superTackle = cfg.proRules && !amar && defendersOnMat <= 3;
      score[opp] += superTackle ? 2 : 1;
      if (!amar) {
        out[r.side] = Math.min(cfg.teamSize, out[r.side] + 1);
        if (cfg.style === 'sanjeevani') out[opp] = Math.max(0, out[opp] - 1);
      }
    }

    // Empty raid streak (for do-or-die on the next raid).
    const empty = raidPts === 0 && !raiderOut;
    emptyRaids[r.side] = empty ? emptyRaids[r.side] + 1 : 0;

    // All-out: +2 to the opponent; gaminee ends, others revive everyone.
    if (!amar) {
      (['home', 'away'] as Side[]).forEach((t) => {
        if (out[t] >= cfg.teamSize) {
          score[other(t)] += 2;
          if (cfg.style === 'gaminee') allOutEnded = true;
          else out[t] = 0;
        }
      });
    }
  }

  return { home: score.home, away: score.away, out, emptyRaids, allOutEnded };
}
