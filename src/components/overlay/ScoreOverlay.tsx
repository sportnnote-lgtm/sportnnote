/**
 * The OBS score overlay (parity #25): a 1920×1080 transparent canvas with the
 * score in one of three themes — bar (full-width, bottom or top), pill
 * (centred) or corner (a scorebug at the top-left). `scale` shrinks the whole
 * canvas (the host's 16:9 preview; a smaller browser window). Draws only what
 * the TickerModel says — the same model for every sport.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, Image, Platform, StyleSheet, Text, View } from 'react-native';
import type { TickerChip, TickerFlash, TickerModel, TickerTeam } from '../../sports/ticker';
import type { OverlayPos, OverlayTheme } from '../../core/overlayParams';

export const CANVAS_W = 1920;
export const CANVAS_H = 1080;
const SAFE_X = 96;
const SAFE_Y = 54;

const C = {
  panel: 'rgba(11,15,21,0.94)',
  panel2: 'rgba(28,34,44,0.94)',
  text: '#FFFFFF',
  muted: '#AEB8C6',
  live: '#FF4D4F',
  wicket: '#E5484D',
  boundary: '#2FB36E',
  extra: '#F5A524',
  chip: 'rgba(255,255,255,0.16)',
};

/** A flash to show; a new `id` re-runs the animation. */
export type OverlayFlash = TickerFlash & { id: number };

export interface ScoreOverlayProps {
  model: TickerModel;
  theme: OverlayTheme;
  pos: OverlayPos;
  sponsorUrl?: string;
  flash?: OverlayFlash | null;
  scale?: number;
  /** a ticking clock (the sport's LiveClock) — shown next to the status */
  clock?: React.ReactNode;
}

export function ScoreOverlay({ model, theme, pos, sponsorUrl, flash, scale = 1, clock }: ScoreOverlayProps) {
  const s = scale;
  const body =
    theme === 'pill' ? <Pill model={model} pos={pos} clock={clock} sponsorUrl={sponsorUrl} flash={flash} />
      : theme === 'corner' ? <Corner model={model} clock={clock} sponsorUrl={sponsorUrl} flash={flash} />
        : <Bar model={model} pos={pos} clock={clock} sponsorUrl={sponsorUrl} flash={flash} />;
  return (
    <View pointerEvents="none" style={{ width: CANVAS_W * s, height: CANVAS_H * s, overflow: 'hidden' }}>
      <View
        style={{
          position: 'absolute', left: 0, top: 0, width: CANVAS_W, height: CANVAS_H,
          // scale about the centre, then pull the top-left corner back to 0,0
          transform: [{ translateX: (-CANVAS_W * (1 - s)) / 2 }, { translateY: (-CANVAS_H * (1 - s)) / 2 }, { scale: s }],
        }}
      >
        {body}
      </View>
    </View>
  );
}

/* ---------------------------------- parts --------------------------------- */

type Part = { model: TickerModel; clock?: React.ReactNode; sponsorUrl?: string; flash?: OverlayFlash | null };

function Logo({ team, size }: { team: TickerTeam; size: number }) {
  if (team.logo) return <Image source={{ uri: team.logo }} style={{ width: size, height: size, borderRadius: size / 5 }} resizeMode="cover" />;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 5, backgroundColor: team.color, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#06120D', fontSize: size * 0.42, fontWeight: '900' }}>{team.short.slice(0, 2).toUpperCase()}</Text>
    </View>
  );
}

function Chips({ chips, size = 36 }: { chips: TickerChip[]; size?: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      {chips.slice(-10).map((c, i) => {
        const bg = c.tone === 'wicket' ? C.wicket : c.tone === 'boundary' ? C.boundary : c.tone === 'extra' ? C.extra : C.chip;
        return (
          <View key={i} style={{ minWidth: size, height: size, borderRadius: size / 2, paddingHorizontal: 8, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: c.tone === 'extra' ? '#1A1200' : C.text, fontSize: size * 0.5, fontWeight: '900' }}>{c.text}</Text>
          </View>
        );
      })}
    </View>
  );
}

function PhaseTag({ phase }: { phase: TickerModel['phase'] }) {
  if (phase === 'pre') return <Text style={[st.tag, { color: C.muted }]}>UPCOMING</Text>;
  if (phase === 'done') return <Text style={[st.tag, { color: C.muted }]}>RESULT</Text>;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: C.live }} />
      <Text style={[st.tag, { color: C.live }]}>LIVE</Text>
    </View>
  );
}

/** The sport's LiveClock is drawn for the app (18 px) — enlarge it for 1080p. */
function Clock({ node, scale = 1.6 }: { node?: React.ReactNode; scale?: number }) {
  if (!node) return null;
  // a transform doesn't change layout size — pad for the growth (clock ≈ 130 px)
  return <View style={{ transform: [{ scale }], marginHorizontal: 8 + (scale - 1) * 70 }}>{node}</View>;
}

function Sponsor({ url }: { url?: string }) {
  if (!url) return null;
  return (
    <View style={st.sponsor}>
      <Text style={st.sponsorBy}>POWERED BY</Text>
      <Image source={{ uri: url }} style={{ width: 160, height: 64 }} resizeMode="contain" />
    </View>
  );
}

function Flash({ flash, model }: { flash?: OverlayFlash | null; model: TickerModel }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!flash) return;
    v.stopAnimation();
    v.setValue(0);
    const native = Platform.OS !== 'web';
    // 1.6 s in all: pop in, hold, fade out.
    Animated.sequence([
      Animated.timing(v, { toValue: 1, duration: 200, useNativeDriver: native }),
      Animated.delay(1200),
      Animated.timing(v, { toValue: 0, duration: 200, useNativeDriver: native }),
    ]).start();
  }, [flash?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!flash) return null;
  const bg = flash.kind === 'wicket' ? C.wicket : flash.kind === 'goal' ? (flash.side ? model[flash.side].color : C.boundary) : C.boundary;
  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, st.flash, { backgroundColor: bg, opacity: v, transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }] }]}
    >
      <Text style={st.flashText} numberOfLines={1}>{flash.text}</Text>
      {flash.sub ? <Text style={st.flashSub} numberOfLines={1}>{flash.sub}</Text> : null}
    </Animated.View>
  );
}

/* ----------------------------------- bar ---------------------------------- */

function BarTeam({ team, mirror }: { team: TickerTeam; mirror?: boolean }) {
  const parts = [
    <View key="c" style={{ width: 10, alignSelf: 'stretch', backgroundColor: team.color }} />,
    <Logo key="l" team={team} size={52} />,
    <Text key="n" style={st.barShort} numberOfLines={1}>{team.short}</Text>,
    team.score ? <Text key="s" style={st.barScore}>{team.score}</Text> : null,
    team.sub ? <Text key="o" style={st.barSub}>{team.sub}</Text> : null,
  ];
  return <View style={[st.barTeam, mirror && { justifyContent: 'flex-end' }]}>{mirror ? parts.reverse() : parts}</View>;
}

function Bar({ model, pos, clock, sponsorUrl, flash }: Part & { pos: OverlayPos }) {
  const hasCells = !!(model.left?.length || model.right?.length || model.chips?.length);
  const row2 = hasCells ? (
    <View style={st.barRow2}>
      {model.left?.length ? <Text style={st.cell} numberOfLines={1}>{model.left.join('     ')}</Text> : null}
      {model.right?.length ? <><View style={st.sep} /><Text style={st.cell} numberOfLines={1}>{model.right.join('     ')}</Text></> : null}
      {model.chips?.length ? <><View style={st.sep} /><Text style={st.cellLabel}>THIS OVER</Text><Chips chips={model.chips} /></> : null}
    </View>
  ) : model.detail ? (
    <View style={[st.barRow2, { justifyContent: 'center' }]}><Text style={st.cell} numberOfLines={1}>{model.detail}</Text></View>
  ) : null;
  const centre = model.banner && model.phase === 'live' ? (
    <View style={st.barCentre}>
      <Text style={st.banner} numberOfLines={1}>{model.banner}</Text>
      <Text style={st.barStatusSmall} numberOfLines={1}>{model.status}</Text>
    </View>
  ) : (
    <View style={st.barCentre}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
        <PhaseTag phase={model.phase} />
        <Text style={[st.barStatus, { marginLeft: 16 }]} numberOfLines={1}>{model.status}</Text>
        {model.phase === 'live' ? <Clock node={clock} /> : null}
      </View>
    </View>
  );
  const top = pos === 'top';
  return (
    <View style={[st.barWrap, top ? { top: SAFE_Y } : { bottom: SAFE_Y }]}>
      {!top && sponsorUrl ? <View style={st.barSponsorRow}><Sponsor url={sponsorUrl} /></View> : null}
      <View style={st.bar}>
        <View style={st.barRow1}>
          <BarTeam team={model.home} />
          {centre}
          <BarTeam team={model.away} mirror />
        </View>
        {row2}
        <Flash flash={flash} model={model} />
      </View>
      {top && sponsorUrl ? <View style={st.barSponsorRow}><Sponsor url={sponsorUrl} /></View> : null}
    </View>
  );
}

/* ---------------------------------- pill ---------------------------------- */

function Pill({ model, pos, clock, sponsorUrl, flash }: Part & { pos: OverlayPos }) {
  const top = pos === 'top';
  const extras = [model.phase === 'live' ? model.banner : undefined, ...(model.phase === 'live' ? [...(model.left ?? []), ...(model.right ?? [])] : [])].filter(Boolean) as string[];
  const strip = extras.length || model.chips?.length ? (
    <View style={st.pillStrip}>
      {extras.length ? <Text style={st.pillCell} numberOfLines={1}>{extras.join('  ·  ')}</Text> : null}
      {model.chips?.length ? <Chips chips={model.chips} size={30} /> : null}
    </View>
  ) : null;
  const team = (t: TickerTeam, mirror: boolean) => {
    const parts = [
      <View key="d" style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: t.color }} />,
      <Text key="n" style={st.pillShort} numberOfLines={1}>{t.short}</Text>,
      t.score ? <Text key="s" style={st.pillScore}>{t.score}</Text> : null,
    ];
    return <View style={[st.pillTeam, mirror && { justifyContent: 'flex-end' }]}>{mirror ? parts.reverse() : parts}</View>;
  };
  return (
    <View style={[st.pillWrap, top ? { top: SAFE_Y } : { bottom: SAFE_Y }]}>
      {top ? null : strip}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <View style={st.pill}>
          {team(model.home, false)}
          <View style={st.pillSep} />
          <View style={st.pillCentre}>
            <Text style={st.pillStatus} numberOfLines={1}>{model.status}</Text>
            {model.phase === 'live' ? <Clock node={clock} scale={1.25} /> : null}
          </View>
          <View style={st.pillSep} />
          {team(model.away, true)}
          <Flash flash={flash} model={model} />
        </View>
        {sponsorUrl ? <Sponsor url={sponsorUrl} /> : null}
      </View>
      {top ? strip : null}
    </View>
  );
}

/* --------------------------------- corner --------------------------------- */

function Corner({ model, clock, sponsorUrl, flash }: Part) {
  const row = (t: TickerTeam, side: 'home' | 'away') => (
    <View style={st.cornerRow}>
      <View style={{ width: 8, alignSelf: 'stretch', backgroundColor: t.color }} />
      <Text style={st.cornerBat}>{model.batting === side && model.phase === 'live' ? '▶' : ' '}</Text>
      <Logo team={t} size={40} />
      <Text style={st.cornerShort} numberOfLines={1}>{t.short}</Text>
      {t.sub ? <Text style={st.cornerSub}>{t.sub}</Text> : null}
      {t.score ? <Text style={st.cornerScore}>{t.score}</Text> : null}
    </View>
  );
  const live = model.phase === 'live';
  return (
    <View style={st.cornerWrap}>
      <View style={st.corner}>
        {row(model.home, 'home')}
        {row(model.away, 'away')}
        <View style={st.cornerStatus}>
          <PhaseTag phase={model.phase} />
          <Text style={st.cornerStatusText} numberOfLines={2}>{model.status}</Text>
          {live ? <Clock node={clock} /> : null}
        </View>
        {live && model.banner ? <Text style={st.cornerBanner} numberOfLines={1}>{model.banner}</Text> : null}
        {live && (model.left?.length || model.right?.length) ? (
          <View style={st.cornerCells}>
            {[...(model.left ?? []), ...(model.right ?? [])].map((l, i) => <Text key={i} style={st.cornerCell} numberOfLines={1}>{l}</Text>)}
          </View>
        ) : null}
        {live && model.chips?.length ? <View style={st.cornerChips}><Chips chips={model.chips} size={30} /></View> : null}
        {!live && model.detail ? <Text style={[st.cornerCell, { paddingHorizontal: 16, paddingBottom: 10 }]} numberOfLines={2}>{model.detail}</Text> : null}
        <Flash flash={flash} model={model} />
      </View>
      {sponsorUrl ? <View style={{ marginTop: 12 }}><Sponsor url={sponsorUrl} /></View> : null}
    </View>
  );
}

const st = StyleSheet.create({
  tag: { fontSize: 18, fontWeight: '900', letterSpacing: 2 },
  sep: { width: 2, height: 28, backgroundColor: 'rgba(255,255,255,0.22)', marginHorizontal: 20 },
  cell: { color: C.text, fontSize: 24, fontWeight: '700', flexShrink: 1 },
  cellLabel: { color: C.muted, fontSize: 16, fontWeight: '900', letterSpacing: 1.5, marginRight: 12 },
  banner: { color: C.text, fontSize: 32, fontWeight: '900', textAlign: 'center' },

  // bar: 1728 × 120 (72 + 48)
  barWrap: { position: 'absolute', left: SAFE_X, width: CANVAS_W - 2 * SAFE_X },
  barSponsorRow: { flexDirection: 'row', justifyContent: 'flex-end', marginVertical: 10 },
  bar: { width: '100%', borderRadius: 14, overflow: 'hidden', backgroundColor: C.panel },
  barRow1: { height: 72, flexDirection: 'row', alignItems: 'center' },
  barTeam: { width: 520, height: 72, flexDirection: 'row', alignItems: 'center', gap: 16 },
  barShort: { color: C.text, fontSize: 32, fontWeight: '900', maxWidth: 220, letterSpacing: 0.5 },
  barScore: { color: C.text, fontSize: 40, fontWeight: '900' },
  barSub: { color: C.muted, fontSize: 24, fontWeight: '700' },
  barCentre: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  barStatus: { color: C.text, fontSize: 28, fontWeight: '800', flexShrink: 1 },
  barStatusSmall: { color: C.muted, fontSize: 18, fontWeight: '700', marginTop: 2 },
  barRow2: { height: 48, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, backgroundColor: C.panel2 },

  // pill: 1100 × 88, centred
  pillWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', gap: 10 },
  pill: { width: 1100, height: 88, borderRadius: 44, overflow: 'hidden', backgroundColor: C.panel, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 36 },
  pillTeam: { width: 300, flexDirection: 'row', alignItems: 'center', gap: 14 },
  pillShort: { color: C.text, fontSize: 30, fontWeight: '900', maxWidth: 170 },
  pillScore: { color: C.text, fontSize: 38, fontWeight: '900' },
  pillSep: { width: 2, height: 44, backgroundColor: 'rgba(255,255,255,0.22)', marginHorizontal: 12 },
  pillCentre: { flex: 1, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
  pillStatus: { color: C.text, fontSize: 24, fontWeight: '800', textAlign: 'center', flexShrink: 1 },
  pillStrip: { maxWidth: 1100, height: 48, borderRadius: 24, backgroundColor: C.panel2, flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 24 },
  pillCell: { color: C.text, fontSize: 22, fontWeight: '700', flexShrink: 1 },

  // corner: a 520 px scorebug
  cornerWrap: { position: 'absolute', left: SAFE_X, top: SAFE_Y, width: 520 },
  corner: { width: 520, borderRadius: 12, overflow: 'hidden', backgroundColor: C.panel },
  cornerRow: { height: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingRight: 18, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' },
  cornerBat: { color: C.text, fontSize: 22, width: 22, textAlign: 'center' },
  cornerShort: { color: C.text, fontSize: 28, fontWeight: '900', flex: 1 },
  cornerSub: { color: C.muted, fontSize: 20, fontWeight: '700' },
  cornerScore: { color: C.text, fontSize: 34, fontWeight: '900', minWidth: 60, textAlign: 'right' },
  cornerStatus: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, backgroundColor: C.panel2 },
  cornerStatusText: { color: C.text, fontSize: 22, fontWeight: '800', flex: 1 },
  cornerBanner: { color: C.text, fontSize: 24, fontWeight: '900', paddingHorizontal: 16, paddingTop: 10 },
  cornerCells: { paddingHorizontal: 16, paddingVertical: 8, gap: 4 },
  cornerCell: { color: C.text, fontSize: 21, fontWeight: '700' },
  cornerChips: { paddingHorizontal: 16, paddingBottom: 12 },

  sponsor: { alignItems: 'center', justifyContent: 'center', backgroundColor: C.panel, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6, gap: 2 },
  sponsorBy: { color: C.muted, fontSize: 12, fontWeight: '900', letterSpacing: 1.5 },

  flash: { alignItems: 'center', justifyContent: 'center', zIndex: 5 },
  flashText: { color: '#FFFFFF', fontSize: 52, fontWeight: '900', letterSpacing: 3 },
  flashSub: { color: '#FFFFFF', fontSize: 22, fontWeight: '800', opacity: 0.92 },
});
