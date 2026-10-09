/**
 * "🎥 Score overlay for OBS" (parity #25) — the host's Info-tab card. Pick a
 * theme and position, see a live 16:9 preview fed from this screen's own match
 * state (so it works in demo), add a sponsor logo, then copy the one link that
 * goes into OBS as a Browser source. No credits, no confirm step, no login.
 * Theme / position / sponsor are remembered per device for the tournament (or
 * the match) under `sn.overlay.<id>`.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Platform, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { theme } from '../core/theme';
import { Button, SelectChip, textStyles } from './ui';
import { LogoPicker } from './LogoPicker';
import { ScoreOverlay, type OverlayFlash } from './overlay/ScoreOverlay';
import { buildTicker, type TickerFlash, type TickerMeta } from '../sports/ticker';
import type { SportPlugin } from '../sports/types';
import { overlayLink, SHARE_BASE } from '../core/shareText';
import { isSponsorPath, type OverlayPos, type OverlayTheme } from '../core/overlayParams';
import { mediaPathFromUrl } from '../core/imageUrl';

interface Saved { theme?: OverlayTheme; pos?: OverlayPos; sponsorUrl?: string }

const THEMES: { key: OverlayTheme; label: string }[] = [
  { key: 'bar', label: 'Bar' }, { key: 'pill', label: 'Pill' }, { key: 'corner', label: 'Corner' },
];

/** This app's own origin on the web (a dev / demo build links to itself). */
const linkBase = () =>
  Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.origin ? window.location.origin : SHARE_BASE;

export function OverlayPanel({
  matchId, tournamentId, plugin, state, eventCount, syncing, meta,
}: {
  matchId: string;
  tournamentId?: string;
  plugin: SportPlugin<any>;
  state: unknown;
  eventCount: number;
  syncing?: boolean;
  meta: TickerMeta;
}) {
  const [open, setOpen] = useState(false);
  const [th, setTh] = useState<OverlayTheme>('bar');
  const [pos, setPos] = useState<OverlayPos>('bottom');
  const [sponsorUrl, setSponsorUrl] = useState<string | undefined>();
  const [width, setWidth] = useState(0);
  const [flash, setFlash] = useState<OverlayFlash | null>(null);
  const [copied, setCopied] = useState(false);
  const key = `sn.overlay.${tournamentId ?? matchId}`;
  const loaded = useRef(false);

  useEffect(() => {
    let on = true;
    loaded.current = false;
    AsyncStorage.getItem(key).then((raw) => {
      if (!on) return;
      try {
        const s = raw ? (JSON.parse(raw) as Saved) : {};
        if (s.theme === 'bar' || s.theme === 'pill' || s.theme === 'corner') setTh(s.theme);
        if (s.pos === 'top' || s.pos === 'bottom') setPos(s.pos);
        if (s.sponsorUrl) setSponsorUrl(s.sponsorUrl);
      } catch { /* a bad entry → defaults */ }
      loaded.current = true;
    }).catch(() => { loaded.current = true; });
    return () => { on = false; };
  }, [key]);
  useEffect(() => {
    if (!loaded.current) return;
    const s: Saved = { theme: th, pos, ...(sponsorUrl ? { sponsorUrl } : {}) };
    AsyncStorage.setItem(key, JSON.stringify(s)).catch(() => {});
  }, [key, th, pos, sponsorUrl]);

  const model = useMemo(() => buildTicker(plugin, state, meta, eventCount), [plugin, state, meta, eventCount]);

  // The preview flashes on this device's own taps too (one new event, not a
  // load or an undo) — the public overlay flashes only on realtime inserts.
  const prev = useRef<{ state: unknown; count: number } | null>(null);
  useEffect(() => {
    const p = prev.current;
    prev.current = { state, count: eventCount };
    if (!p || syncing || eventCount !== p.count + 1 || !plugin.tickerFlash) return;
    const f = plugin.tickerFlash(p.state, state);
    if (f) setFlash({ ...f, id: Date.now() });
  }, [state, eventCount, syncing, plugin]);

  const testFlash = () => {
    const f: TickerFlash = plugin.id === 'cricket'
      ? { kind: 'wicket', text: 'WICKET!', sub: 'Test flash' }
      : plugin.id === 'football'
        ? { kind: 'goal', text: "GOAL! Test 10'", side: 'home' }
        : { kind: 'four', text: 'TEST FLASH' };
    setFlash({ ...f, id: Date.now() });
  };

  const sponsorPath = mediaPathFromUrl(sponsorUrl);
  const linked = isSponsorPath(sponsorPath) ? sponsorPath : undefined;
  const url = overlayLink(matchId, { theme: th, pos, ...(linked ? { sponsorPath: linked } : {}) }, linkBase());

  const copy = async () => {
    const clip = Platform.OS === 'web' && typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
    try {
      if (clip) { await clip.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2500); return; }
      await Share.share({ message: url });
    } catch { /* closed the sheet / blocked — the link is on screen */ }
  };

  return (
    <View style={st.card}>
      <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen((o) => !o)} style={st.head}>
        <Text style={[textStyles.h3, { flex: 1 }]}>🎥 Score overlay for OBS</Text>
        <Text style={st.caret}>{open ? '⌄' : '›'}</Text>
      </TouchableOpacity>
      {!open ? (
        <Text style={textStyles.muted}>A free live score bar over your stream — one link, no login.</Text>
      ) : (
        <>
          <View style={st.chips}>
            {THEMES.map((t) => <SelectChip key={t.key} label={t.label} active={th === t.key} onPress={() => setTh(t.key)} />)}
          </View>
          {th === 'corner' ? (
            <Text style={textStyles.muted}>The corner scorebug sits at the top-left.</Text>
          ) : (
            <View style={st.chips}>
              <SelectChip label="Bottom" active={pos === 'bottom'} onPress={() => setPos('bottom')} />
              <SelectChip label="Top" active={pos === 'top'} onPress={() => setPos('top')} />
            </View>
          )}

          <View style={st.preview} onLayout={(e) => setWidth(e.nativeEvent.layout.width)} accessibilityLabel="Overlay preview">
            {width > 0 ? (
              <ScoreOverlay model={model} theme={th} pos={pos} sponsorUrl={sponsorUrl} flash={flash} scale={width / 1920}
                clock={plugin.LiveClock ? <plugin.LiveClock state={state} /> : undefined} />
            ) : null}
          </View>
          <View style={{ flexDirection: 'row', gap: theme.spacing(2) }}>
            <Button label="⚡ Test flash" variant="ghost" style={{ flex: 1 }} onPress={testFlash} />
          </View>

          <Text style={st.label}>Sponsor logo (optional)</Text>
          <View style={st.sponsorRow}>
            <LogoPicker kind="sponsor-logo" logoUrl={sponsorUrl} canManage onPick={(u) => setSponsorUrl(u)} placeholder="🏷️" label="Add sponsor" size={56} />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={textStyles.muted}>Shown as “Powered by” next to the score.</Text>
              {sponsorUrl && !linked ? <Text style={st.warn}>Preview only — this logo isn’t uploaded, so the link can’t carry it.</Text> : null}
            </View>
            {sponsorUrl ? <Button label="Remove" variant="ghost" onPress={() => setSponsorUrl(undefined)} /> : null}
          </View>

          <Text style={st.label}>Overlay link</Text>
          <Text style={st.url} selectable numberOfLines={3}>{url}</Text>
          <View style={{ flexDirection: 'row', gap: theme.spacing(2) }}>
            <Button label={copied ? 'Copied ✓' : 'Copy link'} style={{ flex: 1 }} onPress={() => void copy()} />
            <Button label="Open" variant="ghost" onPress={() => void Linking.openURL(url)} />
          </View>

          <Text style={st.label}>Add it in OBS</Text>
          <View style={{ gap: 4 }}>
            <Text style={st.step}>1. Sources ＋ → <Text style={st.b}>Browser</Text>.</Text>
            <Text style={st.step}>2. Paste the link as the URL.</Text>
            <Text style={st.step}>3. Width <Text style={st.b}>1920</Text>, Height <Text style={st.b}>1080</Text> — keep the default Custom CSS (it keeps the page transparent).</Text>
            <Text style={st.step}>4. If the score freezes: right-click the source → <Text style={st.b}>Refresh cache of current page</Text>.</Text>
          </View>
          <Text style={textStyles.muted}>Changing the theme or sponsor changes the link — paste the new one in OBS.</Text>
        </>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  card: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing(4), gap: theme.spacing(2), ...theme.shadow.card },
  head: { flexDirection: 'row', alignItems: 'center' },
  caret: { color: theme.colors.textMuted, fontSize: theme.font.h3, fontWeight: '800', width: 22, textAlign: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  // a stand-in "video" behind the transparent overlay
  preview: { width: '100%', aspectRatio: 16 / 9, borderRadius: theme.radius.sm, overflow: 'hidden', backgroundColor: '#3B4B3F', borderWidth: 1, borderColor: theme.colors.border },
  label: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: theme.spacing(2) },
  sponsorRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3) },
  warn: { color: theme.colors.accent, fontSize: theme.font.tiny, fontWeight: '700' },
  url: { color: theme.colors.text, fontSize: theme.font.small, backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.sm, padding: theme.spacing(2) },
  step: { color: theme.colors.text, fontSize: theme.font.small },
  b: { fontWeight: '800' },
});
