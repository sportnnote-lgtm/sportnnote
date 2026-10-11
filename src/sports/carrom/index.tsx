/**
 * Carrom plugin — archetype: set-game-point (boards → games → match). ICF rules:
 * the board winner scores the opponent's coins left (+3 for a covered Queen while
 * under 22); game to 25 or after 8 boards; best of 3 games (or a single game).
 * Scoring a board = pick the winner, tap coins left, toggle the Queen.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../core/theme';
import { Button, SelectChip, textStyles } from '../../components/ui';
import { askConfirm } from '../../components/ConfirmSheet';
import { RowAction, confirmRemove } from '../TimelineControls';
import type { Player } from '../../core/types';
import type { ScoreAction, SportPlugin } from '../types';
import { SetLineBoard } from '../SetLineBoard';
import { MatchBoxScore } from '../../components/BoxScore';
import { carromBox } from '../boxSources';
import {
  init, reducer, result, boardPoints, boardCloses, creditedPoints, PENALTY_POINTS, summary, scoreLine, lineScore, standingsUnits,
  nextBreaker, boardBreakers, slamFor, boardInputs, boardCorrection,
  type BoardInput, type CarromState, type QueenBy, type Side, type Slam,
} from './engine';
import { carromStatTotals, creditedPlayers } from './totals';
import { ScoreSheet } from './ScoreSheet';

const ScoringControls: SportPlugin<CarromState>['ScoringControls'] = ({ state, dispatch, homeName, awayName, homeRoster = [], awayRoster = [] }) => {
  const s = state as CarromState;
  const perSide = s.perSide ?? 1;
  // Singles: a person's name reads better than a team code ("AM").
  const nameOf = (side: Side) => {
    const r = side === 'home' ? homeRoster : awayRoster;
    return r.length === 1 ? r[0].fullName : side === 'home' ? homeName : awayName;
  };
  const [winner, setWinner] = useState<Side | null>(null);
  const [coins, setCoins] = useState<number | null>(null); // SD-116: no default — the scorer picks
  // SD-117c — the three-way Queen chip (optional): winner / loser / not covered
  const [queenBy, setQueenBy] = useState<QueenBy | null>(null);
  const queen = queenBy === 'winner';
  const [slam, setSlam] = useState<Slam | null>(null);
  // SD-68 (CR-07) — a penalty board: 3 to the side picked, not a board won
  const [penalty, setPenalty] = useState(false);
  const [fixToss, setFixToss] = useState(false);
  // "Played by" (a roster bigger than the side) — kept from board to board
  const [picked, setPicked] = useState<Record<Side, string[]>>({ home: [], away: [] });
  if (s.ended) return <Text style={textStyles.muted}>Match over.</Text>;
  // SD-117c (CR-04) — who breaks this board (toss, then alternating)
  const breaker = nextBreaker(s);
  const derivedSlam = winner ? slamFor(winner, breaker) : null;

  const roster = winner ? (winner === 'home' ? homeRoster : awayRoster) : [];
  const players = winner ? creditedPlayers(roster, perSide, picked[winner]) : [];
  // SD-37: the game score counts at most to 25, and so do the players' points
  const ready = penalty || coins != null;
  const value = winner && ready ? (penalty ? PENALTY_POINTS : boardPoints(coins!, queen, s.current[winner], s)) : 0;
  const credit = winner && ready ? Math.min(value, Math.max(0, s.target - s.current[winner])) : 0;
  // SD-116: say on the button when this board closes the game / the match
  const closes = winner && ready ? boardCloses(s, winner, coins ?? 0, queen, penalty) : null;
  const queenCounts = winner ? s.current[winner] < s.queenCutoff : true;
  const togglePick = (side: Side, id: string) => setPicked((cur) => {
    const now = creditedPlayers(roster, perSide, cur[side]).map((p) => p.id);
    const next = now.includes(id) ? now.filter((x) => x !== id) : [...now, id].slice(-perSide);
    return { ...cur, [side]: next.length ? next : now };
  });
  const record = () => {
    if (!winner || !ready) return;
    // SD-68 — a penalty board credits its points, never a board won / Queen
    const attr = (p: Player) => ({ playerId: p.id, playerName: p.fullName, stat: 'points', by: credit, ...(penalty ? {} : { extra: { boards: 1, ...(queen ? { queens: 1 } : {}) } }) });
    dispatch({
      type: 'BOARD', side: winner,
      payload: penalty ? { coins: 0, queen: false, penalty: true } : { coins, queen, ...(queenBy ? { queenBy } : {}), ...(slam ? { slam } : {}) },
      // SD-37: a board is the side's — both doubles partners are credited
      attribution: players[0] ? attr(players[0]) : undefined,
      attribution2: players[1] ? attr(players[1]) : undefined,
    });
    setWinner(null); setCoins(null); setQueenBy(null); setSlam(null); setPenalty(false);
  };
  const toss = (side: Side) => { dispatch({ type: 'FIRST_BREAK', payload: { side } }); setFixToss(false); };
  const tossPicker = (
    <View style={{ gap: theme.spacing(2) }}>
      <Text style={ctrl.label}>{s.boards.length ? 'Who broke the first board?' : 'Who breaks first?'} <Text style={ctrl.meta}>(the toss · then it alternates)</Text></Text>
      <View style={ctrl.row}>
        <Button label={nameOf('home')} variant={s.firstBreak === 'home' ? 'home' : 'ghost'} style={ctrl.flex} onPress={() => toss('home')} />
        <Button label={nameOf('away')} variant={s.firstBreak === 'away' ? 'away' : 'ghost'} style={ctrl.flex} onPress={() => toss('away')} />
      </View>
      {s.boards.length > 0 && <Text style={ctrl.meta}>Only who broke changes; the score stays.</Text>}
    </View>
  );

  return (
    <View style={{ gap: theme.spacing(4) }}>
      <Text style={ctrl.meta}>Game {s.games.length + 1} · board {s.boardsInGame + 1}{s.boardsInGame >= s.maxBoards ? ' (tie-break)' : ` of ${s.maxBoards}`} · to {s.target}</Text>
      {/* SD-117c (CR-04) — the toss before board 1, then "{name} to break" */}
      {(!s.firstBreak && s.boards.length === 0) || fixToss ? tossPicker : breaker ? (
        <Text style={ctrl.breakLine}>
          ⚪ {nameOf(breaker)} to break{'  '}<Text style={ctrl.link} accessibilityRole="button" onPress={() => setFixToss(true)}>Fix the toss</Text>
        </Text>
      ) : (
        <Text style={ctrl.link} accessibilityRole="button" onPress={() => setFixToss(true)}>Record who broke the first board</Text>
      )}
      <View style={{ gap: theme.spacing(2) }}>
        <Text style={ctrl.label}>Board won by</Text>
        <View style={ctrl.row}>
          <Button label={nameOf('home')} variant={winner === 'home' ? 'home' : 'ghost'} style={ctrl.flex} onPress={() => { if (winner !== 'home') setSlam(null); setWinner('home'); }} />
          <Button label={nameOf('away')} variant={winner === 'away' ? 'away' : 'ghost'} style={ctrl.flex} onPress={() => { if (winner !== 'away') setSlam(null); setWinner('away'); }} />
        </View>
      </View>
      {winner && (
        <>
          {roster.length > perSide && (
            <View style={{ gap: theme.spacing(2) }}>
              <Text style={ctrl.label}>Played by</Text>
              <View style={ctrl.chips}>
                {roster.map((p) => <SelectChip key={p.id} label={p.fullName} active={players.some((x) => x.id === p.id)} onPress={() => togglePick(winner, p.id)} />)}
              </View>
            </View>
          )}
          {/* SD-68 (CR-07) — a penalty board instead of a played-out one */}
          <View style={ctrl.chips}>
            <SelectChip label="Board played out" active={!penalty} onPress={() => setPenalty(false)} />
            <SelectChip label={`⚠️ Penalty board · +${PENALTY_POINTS} to ${nameOf(winner)}`} active={penalty} onPress={() => { setPenalty(true); setSlam(null); setQueenBy(null); }} />
          </View>
          {penalty ? (
            <Text style={ctrl.meta}>The opponent was penalised: {nameOf(winner)} get {PENALTY_POINTS} points. It is not counted as a board won, a Queen or a slam.</Text>
          ) : (<>
          <View style={{ gap: theme.spacing(2) }}>
            <Text style={ctrl.label}>Opponent's coins left{coins == null ? <Text style={ctrl.meta}> · tap one</Text> : null}</Text>
            <View style={ctrl.chips}>
              {Array.from({ length: 10 }, (_, n) => <SelectChip key={n} label={String(n)} active={coins === n} onPress={() => setCoins(n)} />)}
            </View>
          </View>
          {/* SD-117c — who covered the Queen: winner (+3 under 22) / loser (no points) / nobody */}
          <View style={{ gap: theme.spacing(2) }}>
            <Text style={ctrl.label}>👑 Queen covered by <Text style={ctrl.meta}>(optional)</Text></Text>
            <View style={ctrl.chips}>
              <SelectChip label={`Winner${queenCounts ? ' (+3)' : ' (no points at 22+)'}`} active={queenBy === 'winner'} onPress={() => setQueenBy(queenBy === 'winner' ? null : 'winner')} />
              <SelectChip label="Loser (no points)" active={queenBy === 'loser'} onPress={() => setQueenBy(queenBy === 'loser' ? null : 'loser')} />
              <SelectChip label="Not covered" active={queenBy === 'none'} onPress={() => setQueenBy(queenBy === 'none' ? null : 'none')} />
            </View>
          </View>
          <View style={{ gap: theme.spacing(2) }}>
            <Text style={ctrl.label}>Slam? <Text style={ctrl.meta}>(finished in the first turn · optional)</Text></Text>
            <View style={ctrl.chips}>
              {derivedSlam ? (
                // SD-117c — the breaker is known, so White / Black follows from the winner
                <SelectChip label={`${derivedSlam === 'white' ? '⚪ White' : '⚫ Black'} slam · ${derivedSlam === 'white' ? 'broke' : "didn't break"}`} active={slam === derivedSlam} onPress={() => setSlam(slam ? null : derivedSlam)} />
              ) : (
                <>
                  <SelectChip label="⚪ White slam · broke" active={slam === 'white'} onPress={() => setSlam(slam === 'white' ? null : 'white')} />
                  <SelectChip label="⚫ Black slam · didn't break" active={slam === 'black'} onPress={() => setSlam(slam === 'black' ? null : 'black')} />
                </>
              )}
            </View>
          </View>
          </>)}
          <Button
            label={!ready ? '✓ Record board — pick the coins left'
              : `✓ Record ${penalty ? 'penalty board' : 'board'} · +${credit}${closes ? ` · ${closes.winner === winner ? '' : `${nameOf(closes.winner)} `}wins ${closes.kind === 'match' ? 'the match' : `Game ${closes.game}`}` : credit < value ? ` (game at ${s.target})` : ''}`}
            variant={closes ? 'primary' : winner} onPress={record} disabled={!ready} />
        </>
      )}
      {/* SD-117c — fix or remove any past board (the boards replay: EDIT_LOG) */}
      <BoardEditor state={s} dispatch={dispatch} nameOf={nameOf} homeRoster={homeRoster} awayRoster={awayRoster} />
    </View>
  );
};

/** SD-117c — "✎ Correct a board": every recorded board, newest first, with ✎
 *  (winner / coins / Queen / slam) and ✕ (asks first). A change replays the
 *  corrected list (EDIT_LOG) so games, totals and the result re-derive, plus
 *  STAT_ADJUST deltas so the players' live lines follow. */
function BoardEditor({ state: s, dispatch, nameOf, homeRoster, awayRoster }: {
  state: CarromState;
  dispatch: (a: ScoreAction) => void;
  nameOf: (side: Side) => string;
  homeRoster: Player[];
  awayRoster: Player[];
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<{ index: number; b: BoardInput } | null>(null);
  if (s.boards.length === 0) return null;
  const list = boardInputs(s);
  const breakers = boardBreakers(s);
  const capped = creditedPoints(s);
  const commit = (edited: BoardInput[]) => {
    for (const a of boardCorrection(s, edited)) dispatch(a as never);
    setDraft(null);
  };
  const perSide = s.perSide ?? 1;
  // a board whose winner changes credits the new side's players (as live)
  const creditFor = (side: Side, prev?: BoardInput) => {
    if (prev?.side === side && prev.by?.length) return prev.by;
    const roster = side === 'home' ? homeRoster : awayRoster;
    return creditedPlayers(roster, perSide).map((p) => ({ side, id: p.id, name: p.fullName }));
  };
  const save = async () => {
    if (!draft) return;
    const prev = list[draft.index];
    const b: BoardInput = { ...draft.b, by: creditFor(draft.b.side, prev) };
    if (!b.by?.length) delete b.by;
    const ok = await askConfirm({
      title: `Save board ${draft.index + 1}?`,
      message: 'The boards after it are replayed: game scores, the games won and player points can change.',
      yesLabel: 'Yes, save board', noLabel: 'No, go back', tone: 'caution',
    });
    if (ok) commit(list.map((x, i) => (i === draft.index ? b : x)));
  };
  const label = (b: BoardInput, i: number) =>
    `G${s.boards[i].game} · ${nameOf(b.side)} +${capped[i]} ${b.penalty ? '(⚠️ penalty)' : `(${b.coins} coin${b.coins === 1 ? '' : 's'}${b.queen ? ' + 👑' : ''})`}${breakers[i] ? ` · ${nameOf(breakers[i]!)} broke` : ''}`;

  return (
    <View style={{ gap: theme.spacing(2) }}>
      <View style={ctrl.head}>
        <Text style={ctrl.label}>✎ Correct a board</Text>
        <Button label={open ? 'Done' : 'Edit'} variant="ghost" onPress={() => { setOpen((v) => !v); setDraft(null); }} />
      </View>
      {open && (
        <View style={{ gap: theme.spacing(1) }}>
          <Text style={ctrl.meta}>Edit who won a board, the coins left or the Queen, or remove it. The games and player points re-adjust.</Text>
          {draft && (
            <View style={ctrl.draftBox}>
              <Text style={ctrl.label}>✎ Board {draft.index + 1}</Text>
              <View style={ctrl.row}>
                {(['home', 'away'] as const).map((side) => (
                  <Button key={side} label={nameOf(side)} variant={draft.b.side === side ? side : 'ghost'} style={ctrl.flex}
                    onPress={() => setDraft({ ...draft, b: { ...draft.b, side, slam: undefined } })} />
                ))}
              </View>
              <View style={ctrl.chips}>
                <SelectChip label="Played out" active={!draft.b.penalty} onPress={() => setDraft({ ...draft, b: { ...draft.b, penalty: false } })} />
                <SelectChip label={`⚠️ Penalty · +${PENALTY_POINTS}`} active={!!draft.b.penalty} onPress={() => setDraft({ ...draft, b: { ...draft.b, penalty: true, coins: 0, queen: false, queenBy: undefined, slam: undefined } })} />
              </View>
              {!draft.b.penalty && (<>
              <Text style={ctrl.meta}>Opponent's coins left</Text>
              <View style={ctrl.chips}>
                {Array.from({ length: 10 }, (_, n) => <SelectChip key={n} label={String(n)} active={draft.b.coins === n} onPress={() => setDraft({ ...draft, b: { ...draft.b, coins: n } })} />)}
              </View>
              <Text style={ctrl.meta}>👑 Queen covered by</Text>
              <View style={ctrl.chips}>
                {([['winner', 'Winner'], ['loser', 'Loser'], ['none', 'Not covered']] as const).map(([q, l]) => (
                  <SelectChip key={q} label={l} active={(draft.b.queenBy ?? (draft.b.queen ? 'winner' : undefined)) === q}
                    onPress={() => setDraft({ ...draft, b: { ...draft.b, queenBy: q, queen: q === 'winner' } })} />
                ))}
              </View>
              </>)}
              <View style={ctrl.row}>
                <Button label="Save…" variant={draft.b.side} style={ctrl.flex} onPress={() => void save()} />
                <Button label="Cancel" variant="ghost" onPress={() => setDraft(null)} />
              </View>
            </View>
          )}
          {list.map((b, i) => ({ b, i })).reverse().map(({ b, i }) => (
            <View key={i} style={ctrl.editRow}>
              <Text style={ctrl.rowLabel} numberOfLines={2}>{label(b, i)}</Text>
              {!draft && (
                <View style={ctrl.actions}>
                  <RowAction label="✎" tone="edit" a11y={`Edit board ${i + 1}`} onPress={() => setDraft({ index: i, b: { ...b } })} />
                  <RowAction label="✕" tone="remove" a11y={`Remove board ${i + 1}`}
                    onPress={() => void confirmRemove(`board ${i + 1} (${nameOf(b.side)} +${capped[i]})`, () => commit(list.filter((_, j) => j !== i)), 'The boards after it are replayed: game scores, games won and player points re-adjust.')} />
                </View>
              )}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const LiveExtras: NonNullable<SportPlugin<CarromState>['LiveExtras']> = ({ state, homeName, awayName, homeColor, awayColor }) => {
  const s = state as CarromState;
  return (
    <View style={{ gap: theme.spacing(3) }}>
      <Text style={ctrl.label}>Games</Text>
      <View style={ctrl.chips}>
        {s.games.length === 0 ? <Text style={textStyles.muted}>Game 1 in progress…</Text>
          : s.games.map((g, i) => <Text key={i} style={ctrl.chip}>G{i + 1}: {g[0]}-{g[1]}</Text>)}
      </View>
      {/* SD-23: points / boards / queens per side, per game */}
      {s.boards.length > 0 && (
        <MatchBoxScore sport="carrom" source={carromBox(s)} homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor} />
      )}
      {/* SD-68 (CR-03) — the ICF score sheet: board · breaker · winner · coins · Queen · running total */}
      <Text style={ctrl.label}>Score sheet</Text>
      {s.boards.length === 0 ? <Text style={textStyles.muted}>No boards yet.</Text> : (
        <ScoreSheet state={s} homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor} />
      )}
    </View>
  );
};

/** SD-20 — the LineScoreboard: GAMES won + a column of board points per game,
 *  the live game highlighted. */
const CarromScoreboard: NonNullable<SportPlugin<CarromState>['Scoreboard']> = ({ state, homeName, awayName, homeColor, awayColor, live, closed }) => {
  const s = state as CarromState;
  return (
    <SetLineBoard
      ls={lineScore(s)} homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor} live={live} closed={closed}
      status={`Game ${s.games.length + 1} · board ${s.boardsInGame + 1}`}
      bestOf={s.gamesToWin === 1 ? `single game to ${s.target}` : `best of ${s.gamesToWin * 2 - 1} · to ${s.target}`}
    />
  );
};

export const carromPlugin: SportPlugin<CarromState> = {
  id: 'carrom',
  name: 'Carrom',
  icon: '🎱',
  archetype: 'set-game-point',
  participantKind: 'both',
  createInitialState: init,
  reducer,
  isComplete: (s) => s.ended,
  result: (s) => result(s),
  // SD-17: board points over every game (points-difference tie-break).
  standingsUnits,
  // SD-01: once ended → games won + "25-18, 12-25, 25-20" (never the reset 0 : 0).
  summary,
  scoreLine,
  // SD-20: the line score (board grid, a game closed by hand).
  lineScore,
  // SD-37: absolute lines at completion — both partners, capped points, games,
  // boards played, slams, 25-0 games (src/sports/carrom/totals.ts)
  statTotals: carromStatTotals,
  statTotalsNeedsPlayers: true,
  statTotalsPartial: true,
  Scoreboard: CarromScoreboard,
  ScoringControls,
  LiveExtras,
  formatFields: [
    {
      key: 'preset', label: 'Format', type: 'preset', default: 'icf',
      options: [
        { value: 'icf', label: 'ICF (to 25 · 8 boards · best of 3)', set: { target: 25, maxBoards: 8, gamesToWin: 2 } },
        { value: 'single', label: 'Single game to 25', set: { target: 25, maxBoards: 8, gamesToWin: 1 } },
        { value: 'casual29', label: 'Casual (to 29 · best of 3)', set: { target: 29, maxBoards: 12, gamesToWin: 2 } },
        { value: 'custom', label: 'Custom' },
      ],
    },
    {
      key: 'playersPerSide', label: 'Players', type: 'choice', default: 1,
      options: [
        { value: 1, label: 'Singles' },
        { value: 2, label: 'Doubles' },
      ],
    },
    { key: 'target', label: 'Points to win a game', type: 'number', default: 25, min: 10, max: 50, advanced: true },
    { key: 'maxBoards', label: 'Boards per game', type: 'number', default: 8, min: 1, max: 20, advanced: true, hint: 'leader after this many boards wins; level → tie-break board' },
    {
      key: 'gamesToWin', label: 'Match length', type: 'choice', default: 2,
      options: [
        { value: 2, label: 'Best of 3' },
        { value: 1, label: 'Single game' },
      ],
    },
  ],
};

const ctrl = StyleSheet.create({
  row: { flexDirection: 'row', gap: theme.spacing(3) },
  flex: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  label: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700' },
  meta: { color: theme.colors.textMuted, fontSize: theme.font.small },
  link: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '700' },
  breakLine: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '800' },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  draftBox: { gap: theme.spacing(2), backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.md, padding: theme.spacing(3) },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), paddingVertical: theme.spacing(2), borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  rowLabel: { flex: 1, color: theme.colors.text, fontSize: theme.font.small },
  actions: { flexDirection: 'row', gap: theme.spacing(2) },
  chip: {
    color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700',
    backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.pill,
    paddingVertical: theme.spacing(1), paddingHorizontal: theme.spacing(3),
  },
});
