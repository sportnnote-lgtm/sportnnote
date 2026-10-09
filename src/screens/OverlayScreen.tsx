/**
 * `/o/<matchId>` — the public OBS score overlay (parity #25, web only).
 * Rendered by RootNavigator OUTSIDE the navigator (no header, guest bar, auth
 * wait or app banners) so the page can be fully transparent over the video.
 * Read-only: replays the match log and applies realtime inserts; a wicket /
 * boundary / goal flashes only when it arrives live (never on load or reload).
 * Theme, position, sponsor and flash come from the URL (core/overlayParams).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Text, View, useWindowDimensions } from 'react-native';
import { getMatch, getTournaments } from '../data/repos';
import { useLiveMatch } from '../data/useLiveMatch';
import { getSport } from '../sports/registry';
import { buildTicker, type TickerMeta } from '../sports/ticker';
import { mergeMatchConfig } from '../core/matchConfig';
import { manualResultLine } from '../core/matchResult';
import { breakLabel, readBreak, type MatchBreak } from '../data/matchHousekeeping';
import { formatTime } from '../core/time';
import { parseOverlayParams, type OverlayParams } from '../core/overlayParams';
import { ScoreOverlay, CANVAS_W, CANVAS_H, type OverlayFlash } from '../components/overlay/ScoreOverlay';
import type { Match } from '../core/types';

const META_REFRESH_MS = 120_000;

/** Make the page itself see-through (OBS composites it over the video). */
function useTransparentPage() {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const els = [document.documentElement, document.body, document.getElementById('root')].filter(Boolean) as HTMLElement[];
    const before = els.map((e) => e.style.background);
    for (const e of els) e.style.background = 'transparent';
    document.title = 'SportnNote score overlay';
    return () => els.forEach((e, i) => { e.style.background = before[i]; });
  }, []);
}

export function overlayMatchId(pathname: string): string | null {
  const m = /^\/o\/([^/?#]+)/.exec(pathname);
  return m ? decodeURIComponent(m[1]) : null;
}

export default function OverlayScreen() {
  useTransparentPage();
  const id = typeof window !== 'undefined' ? overlayMatchId(window.location.pathname) : null;
  const params = useMemo(
    () => parseOverlayParams(typeof window !== 'undefined' ? window.location.search : '', process.env.EXPO_PUBLIC_SUPABASE_URL),
    [],
  );
  const [match, setMatch] = useState<Match | null | undefined>(undefined);
  const [config, setConfig] = useState<Record<string, unknown> | undefined>(undefined);
  const lastConfig = useRef('');

  // Load the match + its tournament format, and refresh this meta every 120 s
  // (names, logos, a break, a result closed by hand). Events stream separately.
  useEffect(() => {
    if (!id) { setMatch(null); return; }
    let on = true;
    const load = async () => {
      try {
        const m = await getMatch(id);
        if (!on) return;
        if (!m) { setMatch((cur) => (cur ? cur : null)); return; }
        const tour = m.tournamentId ? (await getTournaments()).find((t) => t.id === m.tournamentId) : undefined;
        const merged = mergeMatchConfig(tour?.formats?.[m.sport] as Record<string, unknown> | undefined, m.format as Record<string, unknown> | undefined);
        const json = JSON.stringify(merged ?? null);
        // Same rules → same object, so the live match isn't rebuilt every refresh.
        if (json !== lastConfig.current) { lastConfig.current = json; setConfig(merged); }
        if (on) setMatch(m);
      } catch {
        if (on) setMatch((cur) => (cur === undefined ? null : cur));
      }
    };
    void load();
    const t = setInterval(load, META_REFRESH_MS);
    return () => { on = false; clearInterval(t); };
  }, [id]);

  if (match === undefined) return <View style={{ flex: 1, backgroundColor: 'transparent' }} />;
  if (!match) {
    return (
      <View style={{ flex: 1, backgroundColor: 'transparent', alignItems: 'center', justifyContent: 'flex-end', padding: 24 }}>
        <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 14 }}>match not found</Text>
      </View>
    );
  }
  return <LiveOverlay key={match.id} match={match} config={config} params={params} />;
}

function LiveOverlay({ match, config, params }: { match: Match; config?: Record<string, unknown>; params: OverlayParams }) {
  const plugin = getSport(match.sport);
  const [flash, setFlash] = useState<OverlayFlash | null>(null);
  const { state, eventCount } = useLiveMatch({
    matchId: match.id, sport: match.sport, canScore: false, readOnly: true, config,
    // Only realtime inserts flash — a load, reconnect or undo never does.
    onRemoteEvent: (prev, next) => {
      if (!params.flash || !plugin.tickerFlash) return;
      const f = plugin.tickerFlash(prev, next);
      if (f) setFlash({ ...f, id: Date.now() });
    },
  });
  const { width, height } = useWindowDimensions();
  const scale = Math.min(width / CANVAS_W, height / CANVAS_H) || 1;

  const meta: TickerMeta = useMemo(() => {
    const brk = (match.onBreak as MatchBreak | undefined) ?? readBreak(match.format as Record<string, unknown> | undefined);
    const h = match.homeTeam, a = match.awayTeam;
    return {
      home: { name: h.name, short: h.shortName || h.name, color: h.colorHex, logo: h.logoUrl },
      away: { name: a.name, short: a.shortName || a.name, color: a.colorHex, logo: a.logoUrl },
      startsLabel: match.startsAt ? formatTime(match.startsAt) : undefined,
      resultLine: match.result ? manualResultLine(match.result, h.shortName || h.name, a.shortName || a.name) : undefined,
      status: match.status,
      breakLabel: brk && match.status !== 'completed' ? breakLabel(brk) : undefined,
    };
  }, [match]);
  const model = buildTicker(plugin, state, meta, eventCount);

  return (
    <View style={{ flex: 1, backgroundColor: 'transparent', overflow: 'hidden' }}>
      <ScoreOverlay
        model={model} theme={params.theme} pos={params.pos} sponsorUrl={params.sponsorUrl}
        flash={params.flash ? flash : null} scale={scale}
        clock={plugin.LiveClock ? <plugin.LiveClock state={state} /> : undefined}
      />
    </View>
  );
}
