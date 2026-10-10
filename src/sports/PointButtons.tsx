/**
 * SD-115 — the one point-entry layout for every racket sport (tennis, badminton,
 * table tennis, squash, padel, pickleball; rally and side-out / English scoring
 * alike). Extends SD-61 (badminton doubles "Rally won").
 *
 *  • Two large side-by-side buttons (~64pt, a gap between) in each side's team
 *    colour, named for the side — the wrong-side tap was the main risk when the
 *    two sides were stacked grey pills.
 *  • Singles: the tap credits the only player automatically.
 *  • Doubles: the tap scores for the side; crediting a player is optional —
 *    long-press a side (or "Credit a player") for that side's player chips.
 *  • Disabled with a hint until "who serves first?" is answered.
 *
 * Also here: `ServeFirstPicker` (no default; "Fix who served first" mid-match)
 * and `SecondaryAction` (tennis Ace / Double fault — outline, smaller).
 */
import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import { SelectChip } from '../components/ui';
import type { Player } from '../core/types';

type Side = 'home' | 'away';

/** Dark or light text, whichever reads on `hex` (team colours vary). */
export function inkOn(hex: string | undefined): string {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec((hex ?? '').trim());
  if (!m) return '#06120D';
  const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return L > 0.36 ? '#06120D' : '#FFFFFF';
}

export function PointButtons({
  homeName, awayName, homeColor, awayColor, homeRoster = [], awayRoster = [], onPoint,
  icon, verb = 'Point', serving, disabled, disabledHint, credit = true,
}: {
  homeName: string;
  awayName: string;
  homeColor?: string;
  awayColor?: string;
  homeRoster?: Player[];
  awayRoster?: Player[];
  /** score a point for `side`, credited to `p` when known */
  onPoint: (side: Side, p?: Player) => void;
  icon: string;
  /** "Point" / "Rally won" */
  verb?: string;
  /** the serving side — marked on its button */
  serving?: Side | null;
  disabled?: boolean;
  /** shown above the buttons while disabled */
  disabledHint?: string;
  /** offer optional player credit in doubles (off where the engine credits the
   *  server itself, e.g. side-out scoring) */
  credit?: boolean;
}) {
  const [pick, setPick] = useState<Side | 'both' | null>(null);
  const rosterOf = (s: Side) => (s === 'home' ? homeRoster : awayRoster);
  const nameOf = (s: Side) => (s === 'home' ? homeName : awayName);
  const colorOf = (s: Side) => (s === 'home' ? homeColor ?? theme.colors.home : awayColor ?? theme.colors.away);
  const canCredit = (s: Side) => credit && rosterOf(s).length >= 2;
  const anyCredit = canCredit('home') || canCredit('away');

  const tap = (s: Side) => {
    if (disabled) return;
    const r = rosterOf(s);
    onPoint(s, r.length === 1 ? r[0] : undefined); // singles: auto-credit
    setPick(null);
  };

  const big = (s: Side) => {
    const bg = colorOf(s);
    const ink = inkOn(bg);
    const solo = rosterOf(s).length === 1 ? rosterOf(s)[0].fullName : undefined;
    return (
      <Pressable
        key={s}
        onPress={() => tap(s)}
        onLongPress={canCredit(s) && !disabled ? () => setPick(s) : undefined}
        delayLongPress={350}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={`${verb} to ${nameOf(s)}`}
        accessibilityHint={canCredit(s) ? 'Long-press to credit a player' : undefined}
        accessibilityState={{ disabled: !!disabled }}
        style={({ pressed }) => [pb.big, { backgroundColor: bg }, pressed && pb.pressed, disabled && pb.off]}
      >
        <Text style={[pb.bigName, { color: ink }]} numberOfLines={2}>{solo ?? nameOf(s)}</Text>
        <Text style={[pb.bigSub, { color: ink }]} numberOfLines={1}>{icon} {verb}</Text>
        {serving === s ? <Text style={[pb.bigServe, { color: ink, borderColor: ink }]} numberOfLines={1}>SERVING</Text> : null}
      </Pressable>
    );
  };

  const creditRow = (s: Side) => (
    <View key={`c-${s}`} style={pb.creditRow}>
      <View style={[pb.dot, { backgroundColor: colorOf(s) }]} />
      <Text style={pb.meta}>{verb} to {nameOf(s)} — by:</Text>
      {rosterOf(s).map((p) => (
        <SelectChip key={p.id} label={p.fullName} active={false} onPress={() => { if (!disabled) { onPoint(s, p); setPick(null); } }} />
      ))}
    </View>
  );

  return (
    <View style={pb.wrap}>
      {disabled && disabledHint ? <Text style={pb.hint}>☝️ {disabledHint}</Text> : null}
      <View style={pb.row}>{big('home')}{big('away')}</View>
      {pick && !disabled ? (
        <View style={pb.creditBox}>
          {(pick === 'both' ? (['home', 'away'] as const).filter(canCredit) : [pick]).map(creditRow)}
          <Text style={pb.link} onPress={() => setPick(null)} accessibilityRole="button">Cancel</Text>
        </View>
      ) : anyCredit && !disabled ? (
        <Text style={pb.meta}>
          Tap a side to score it. Crediting a player is optional —{' '}
          <Text style={pb.link} onPress={() => setPick('both')} accessibilityRole="button">credit a player</Text>
          {' '}(or long-press a side).
        </Text>
      ) : null}
    </View>
  );
}

/** Secondary outline action (tennis Ace / Double fault): smaller, below the
 *  point buttons, so it never draws a tap meant for a plain point. */
export function SecondaryAction({ label, onPress, color, disabled }: { label: string; onPress: () => void; color?: string; disabled?: boolean }) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [pb.sec, color ? { borderColor: color } : null, pressed && pb.pressed, disabled && pb.off]}
    >
      <Text style={pb.secText} numberOfLines={2}>{label}</Text>
    </Pressable>
  );
}

/**
 * "Who serves first?" — nothing selected until the scorer picks (SD-115). Once
 * play has started it folds into a "Fix who served first" link (when the sport
 * allows it): serve is derived, so fixing it changes no score, only who served.
 */
export function ServeFirstPicker({
  icon, homeName, awayName, picked, started, canFix = true, onPick, title = 'Who serves first?',
}: {
  icon: string;
  homeName: string;
  awayName: string;
  /** the chosen first server — null until picked */
  picked: Side | null;
  /** points have been played */
  started: boolean;
  /** offer the mid-match fix (false e.g. in side-out scoring) */
  canFix?: boolean;
  /** `fix` = a mid-match correction (dispatch with `v:2`) */
  onPick: (side: Side, fix: boolean) => void;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  if (!started) {
    return (
      <View style={pb.pickBox}>
        <Text style={pb.label}>{icon} {title}</Text>
        <View style={pb.chips}>
          <SelectChip label={homeName} active={picked === 'home'} onPress={() => onPick('home', false)} />
          <SelectChip label={awayName} active={picked === 'away'} onPress={() => onPick('away', false)} />
        </View>
      </View>
    );
  }
  if (!canFix) return null;
  if (!open) return <Text style={pb.link} onPress={() => setOpen(true)} accessibilityRole="button">Fix who served first</Text>;
  return (
    <View style={pb.pickBox}>
      <Text style={pb.label}>{icon} Who served first?</Text>
      <Text style={pb.meta}>Only the serve changes — the score stays. Serve stats re-derive.</Text>
      <View style={pb.chips}>
        {(['home', 'away'] as const).map((s) => (
          <SelectChip key={s} label={s === 'home' ? homeName : awayName} active={picked === s}
            onPress={() => { if (picked !== s) onPick(s, true); setOpen(false); }} />
        ))}
        <Text style={[pb.link, { alignSelf: 'center' }]} onPress={() => setOpen(false)} accessibilityRole="button">Done</Text>
      </View>
    </View>
  );
}

const pb = StyleSheet.create({
  wrap: { gap: theme.spacing(2) },
  row: { flexDirection: 'row', gap: theme.spacing(3) },
  big: {
    flex: 1, minHeight: 64, borderRadius: theme.radius.md, alignItems: 'center', justifyContent: 'center',
    paddingVertical: theme.spacing(2), paddingHorizontal: theme.spacing(2), ...theme.shadow.card,
  },
  bigName: { fontSize: theme.font.h3, fontWeight: '900', textAlign: 'center' },
  bigSub: { fontSize: theme.font.small, fontWeight: '700', opacity: 0.85, marginTop: 2 },
  bigServe: {
    fontSize: theme.font.tiny, fontWeight: '900', letterSpacing: 0.6, marginTop: 3,
    borderWidth: 1, borderRadius: theme.radius.pill, paddingHorizontal: theme.spacing(2), paddingVertical: 1, overflow: 'hidden',
  },
  pressed: { opacity: 0.75, transform: [{ scale: 0.98 }] },
  off: { opacity: 0.35 },
  hint: { color: theme.colors.accent, fontSize: theme.font.small, fontWeight: '700' },
  meta: { color: theme.colors.textMuted, fontSize: theme.font.small },
  link: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '700' },
  creditBox: { gap: theme.spacing(2), backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.md, padding: theme.spacing(3) },
  creditRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: theme.spacing(2) },
  dot: { width: 10, height: 10, borderRadius: 5 },
  sec: {
    flexGrow: 1, flexBasis: 130, minHeight: 44, borderWidth: 1.5, borderColor: theme.colors.border, borderRadius: theme.radius.md,
    alignItems: 'center', justifyContent: 'center', paddingVertical: theme.spacing(2), paddingHorizontal: theme.spacing(3),
  },
  secText: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700', textAlign: 'center' },
  pickBox: { gap: theme.spacing(2) },
  label: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
});
