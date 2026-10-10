/**
 * Chess plugin — archetype: result. One recorded result per game: who won (or a
 * draw) and how. Scoring is 1 / ½ / 0, so league tables read like a crosstable
 * and the Swiss pairing engine fits open tournaments directly. Each player is
 * credited a game (+ win/draw/loss) on their profile when the result is recorded.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity } from 'react-native';
import { theme } from '../../core/theme';
import { Button, SelectChip, textStyles } from '../../components/ui';
import { askConfirm } from '../../components/ConfirmSheet';
import { confirmCopy } from '../../core/matchSafety';
import type { Attribution, SportPlugin } from '../types';
import {
  init, reducer, points, resultString, resultSentence, scoreFor, DECISIVE, DRAWN, METHOD_LABEL, isForfeit, clockText, parseClock,
  type ChessMethod, type ChessState, type Side,
} from './engine';

const half = (n: number) => (n === 0.5 ? '½' : String(n));

const TIME_CONTROL_LABEL: Record<string, string> = {
  classical: 'Classical', rapid: 'Rapid', blitz: 'Blitz', bullet: 'Bullet', untimed: 'Untimed',
};

type Pick = 'white' | 'draw' | 'black';

const ScoringControls: SportPlugin<ChessState>['ScoringControls'] = ({ state, dispatch, homeName, awayName, homeRoster = [], awayRoster = [] }) => {
  const s = state as ChessState;
  // SD-116: the result is picked the arbiter's way (1-0 / ½-½ / 0-1, White
  // first) and the colours are a draft until Record — a stray tap on the White
  // chips no longer overwrites the paired colour (config.white) in the log.
  const [pick, setPick] = useState<Pick | null>(null);
  const [whiteDraft, setWhiteDraft] = useState<Side | null>(null);
  const [unlockColour, setUnlockColour] = useState(false);
  const [method, setMethod] = useState<ChessMethod | null>(null);
  const [moves, setMoves] = useState('');
  // SD-117c — optional clock times left (typed "4:07", "1:05:30" or minutes)
  const [clockW, setClockW] = useState('');
  const [clockB, setClockB] = useState('');
  const [busy, setBusy] = useState(false);
  // A person's full name reads better than a team code ("AM") in a 1-v-1 game.
  const nameOf = (side: Side) => (side === 'home' ? homeRoster : awayRoster)[0]?.fullName ?? (side === 'home' ? homeName : awayName);

  if (s.ended) {
    return (
      <View style={ctrl.box}>
        <Text style={ctrl.big}>{resultString(s)}</Text>
        <Text style={textStyles.body}>
          {s.winner === 'draw' ? 'Draw' : `${nameOf(s.winner as Side)} won`}{s.method ? ` · ${METHOD_LABEL[s.method]}` : ''}{s.moves ? ` · ${s.moves} moves` : ''}
        </Text>
        <Text style={textStyles.muted}>♔ {nameOf(s.white)} had White</Text>
        {s.clock && (s.clock.white != null || s.clock.black != null) ? (
          <Text style={textStyles.muted}>⏱ Time left · White {s.clock.white != null ? clockText(s.clock.white) : '–'} · Black {s.clock.black != null ? clockText(s.clock.black) : '–'}</Text>
        ) : null}
      </View>
    );
  }

  const white: Side = whiteDraft ?? s.white;
  const black: Side = white === 'home' ? 'away' : 'home';
  const winner: Side | 'draw' | null = pick === 'draw' ? 'draw' : pick === 'white' ? white : pick === 'black' ? black : null;
  const colourLocked = !unlockColour;
  const methods = winner === 'draw' ? DRAWN : winner ? DECISIVE : [];
  const record = async () => {
    if (!winner || busy) return;
    const what = resultSentence(white, winner, nameOf(white), nameOf(black), method ?? undefined);
    setBusy(true);
    const ok = await askConfirm(confirmCopy('recordResult', { what }));
    setBusy(false);
    if (!ok) return;
    // Credit both players a game (+ the outcome) so it shows on their profiles.
    // SD-117c: a forfeit is no game played — it credits a forfeit win / loss
    // instead of `games` + `wins` / `losses` (FIDE: excluded from played games).
    const credit = (side: Side): Attribution | undefined => {
      const p = (side === 'home' ? homeRoster : awayRoster)[0];
      if (!p) return undefined;
      if (isForfeit(method) && winner !== 'draw') {
        return { playerId: p.id, playerName: p.fullName, stat: winner === side ? 'forfeitWins' : 'forfeitLosses', by: 1 };
      }
      const outcome = winner === 'draw' ? 'draws' : winner === side ? 'wins' : 'losses';
      return { playerId: p.id, playerName: p.fullName, stat: 'games', by: 1, extra: { [outcome]: 1 } };
    };
    const w = parseClock(clockW); const b = parseClock(clockB);
    const clock = w != null || b != null ? { ...(w != null ? { white: w } : {}), ...(b != null ? { black: b } : {}) } : undefined;
    // the colour is committed only now, and only if it really changed
    if (white !== s.white) dispatch({ type: 'SET_WHITE', payload: { side: white } });
    dispatch({
      type: 'RESULT',
      side: winner === 'draw' ? undefined : winner,
      payload: { winner, method: method ?? undefined, moves: Number(moves) || undefined, ...(clock ? { clock } : {}) },
      attribution: credit('home'),
      attribution2: credit('away'),
    });
  };
  const choose = (p: Pick) => { setPick(p); setMethod(null); };
  const tile = (p: Pick, score: string, caption: string, names: string) => (
    <TouchableOpacity key={p} onPress={() => choose(p)} activeOpacity={0.8} accessibilityRole="button"
      accessibilityLabel={`${score} ${caption} — ${names}`} accessibilityState={{ selected: pick === p }}
      style={[ctrl.tile, pick === p && ctrl.tileOn]}>
      <Text style={[ctrl.tileScore, pick === p && ctrl.tileOnText]}>{score}</Text>
      <Text style={[ctrl.tileCaption, pick === p && ctrl.tileOnText]}>{caption}</Text>
      <Text style={[ctrl.tileNames, pick === p && ctrl.tileOnText]} numberOfLines={2}>{names}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={{ gap: theme.spacing(4) }}>
      <View style={{ gap: theme.spacing(2) }}>
        <Text style={ctrl.label}>♔ White pieces: {nameOf(white)}</Text>
        {colourLocked ? (
          <Text style={textStyles.muted} accessibilityRole="button" onPress={() => setUnlockColour(true)}>
            ♚ {nameOf(black)} has Black · <Text style={ctrl.link}>Colours wrong? Change…</Text>
          </Text>
        ) : (
          <>
            <View style={ctrl.chips}>
              <SelectChip label={nameOf('home')} active={white === 'home'} onPress={() => setWhiteDraft('home')} />
              <SelectChip label={nameOf('away')} active={white === 'away'} onPress={() => setWhiteDraft('away')} />
            </View>
            <Text style={ctrl.meta}>{white !== s.white ? 'Saved with the result — this changes the paired colour.' : 'Saved with the result.'}</Text>
          </>
        )}
      </View>
      <View style={{ gap: theme.spacing(2) }}>
        <Text style={ctrl.label}>Result <Text style={ctrl.meta}>(White first)</Text></Text>
        <View style={ctrl.tiles}>
          {tile('white', '1-0', 'White wins', `${nameOf(white)} beat ${nameOf(black)}`)}
          {tile('draw', '½-½', 'Draw', `${nameOf(white)} · ${nameOf(black)}`)}
          {tile('black', '0-1', 'Black wins', `${nameOf(black)} beat ${nameOf(white)}`)}
        </View>
      </View>
      {methods.length > 0 && (
        <View style={{ gap: theme.spacing(2) }}>
          <Text style={ctrl.label}>How (optional)</Text>
          <View style={ctrl.chips}>
            {methods.map((m) => <SelectChip key={m} label={METHOD_LABEL[m]} active={method === m} onPress={() => setMethod(method === m ? null : m)} />)}
          </View>
          <TextInput
            style={ctrl.input}
            value={moves}
            onChangeText={(v) => setMoves(v.replace(/[^0-9]/g, ''))}
            placeholder="Moves (optional)"
            placeholderTextColor={theme.colors.textMuted}
            keyboardType="number-pad"
            accessibilityLabel="Number of moves"
          />
          {/* SD-117c — optional clock times left at the end */}
          {!isForfeit(method) && (
            <>
              <Text style={ctrl.meta}>Time left on the clocks (optional · 4:07, 1:05:30 or minutes)</Text>
              <View style={ctrl.tiles}>
                {([['White', clockW, setClockW], ['Black', clockB, setClockB]] as const).map(([c, v, set]) => (
                  <TextInput key={c} style={[ctrl.input, { flex: 1 }, v && parseClock(v) == null ? ctrl.bad : null]} value={v}
                    onChangeText={(t) => set(t.replace(/[^0-9:m]/gi, ''))}
                    placeholder={`${c} ⏱`} placeholderTextColor={theme.colors.textMuted}
                    accessibilityLabel={`${c}'s time left`} />
                ))}
              </View>
            </>
          )}
          {isForfeit(method) && <Text style={ctrl.meta}>A forfeit counts in the table, but no game is credited as played.</Text>}
        </View>
      )}
      <Button label={winner ? `✓ Record ${scoreFor(white, winner)}…` : '✓ Record result'} onPress={() => void record()} disabled={!winner || busy} />
    </View>
  );
};

export const chessPlugin: SportPlugin<ChessState> = {
  id: 'chess',
  name: 'Chess',
  icon: '♟️',
  archetype: 'result',
  participantKind: 'individual',
  createInitialState: init,
  reducer,
  isComplete: (s) => s.ended,
  result: (s) => {
    if (!s.ended || !s.winner) return null;
    const p = points(s);
    return { winner: s.winner, home: p.home, away: p.away };
  },
  summary: (s) => {
    const p = points(s);
    return {
      homeScore: s.ended ? half(p.home) : '',
      awayScore: s.ended ? half(p.away) : '',
      statusLine: s.ended
        ? `${resultString(s)}${s.method ? ` · ${METHOD_LABEL[s.method]}` : ''}`
        : `${TIME_CONTROL_LABEL[s.timeControl] ?? s.timeControl} · in play`,
      // SD-117c — the clock times left, when recorded
      detailLine: `${s.white === 'home' ? 'Home' : 'Away'} has White${s.clock && (s.clock.white != null || s.clock.black != null) ? ` · ⏱ White ${s.clock.white != null ? clockText(s.clock.white) : '–'} · Black ${s.clock.black != null ? clockText(s.clock.black) : '–'}` : ''}`,
    };
  },
  ScoringControls,
  formatFields: [
    {
      key: 'timeControl', label: 'Time control', type: 'choice', default: 'rapid',
      hint: 'for the record — the clock is on the board',
      options: [
        { value: 'classical', label: 'Classical (60+ min)' },
        { value: 'rapid', label: 'Rapid (10–60 min)' },
        { value: 'blitz', label: 'Blitz (3–10 min)' },
        { value: 'bullet', label: 'Bullet (< 3 min)' },
        { value: 'untimed', label: 'Untimed' },
      ],
    },
  ],
};

const ctrl = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  meta: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '400' },
  link: { color: theme.colors.primary, fontWeight: '700' },
  tiles: { flexDirection: 'row', gap: theme.spacing(2) },
  tile: {
    flex: 1, minHeight: 84, alignItems: 'center', justifyContent: 'center', gap: 2, padding: theme.spacing(2),
    borderRadius: theme.radius.md, borderWidth: 2, borderColor: theme.colors.border, backgroundColor: theme.colors.surface,
  },
  tileOn: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primary + '22' },
  tileOnText: { color: theme.colors.text },
  tileScore: { color: theme.colors.text, fontSize: 22, fontWeight: '900' },
  tileCaption: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700' },
  tileNames: { color: theme.colors.textMuted, fontSize: 11, textAlign: 'center' },
  label: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700' },
  box: { gap: theme.spacing(1), alignItems: 'center', padding: theme.spacing(4), backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.md },
  big: { color: theme.colors.text, fontSize: 32, fontWeight: '800' },
  bad: { borderColor: theme.colors.danger },
  input: {
    backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, color: theme.colors.text,
    borderRadius: theme.radius.md, paddingVertical: theme.spacing(2), paddingHorizontal: theme.spacing(3), fontSize: theme.font.body,
  },
});
