/**
 * SD-153 — the school-sport market in force on a screen.
 * - useTournamentMarket: a tournament's market (host community's saved market,
 *   else its venue time zone's country, else India) — the same for every viewer.
 * - useViewerMarket: the viewer's own region's market — for display words and
 *   sport names only ("Soccer" in the US).
 */
import { useEffect, useState } from 'react';
import { countryOfZone, useRegion } from '../core/region';
import { marketForCountry, tournamentMarket, type MarketId } from '../core/markets';
import { getOrganization } from './repos';

export function useTournamentMarket(t: { hostOrgId?: string | null; timeZone?: string | null } | null | undefined): MarketId {
  const [orgMarket, setOrgMarket] = useState<{ id: string; market?: string } | null>(null);
  const hostOrgId = t?.hostOrgId ?? undefined;
  useEffect(() => {
    let on = true;
    if (!hostOrgId) { setOrgMarket(null); return; }
    void getOrganization(hostOrgId).then((o) => { if (on) setOrgMarket(o ? { id: o.id, market: o.market } : null); }).catch(() => {});
    return () => { on = false; };
  }, [hostOrgId]);
  return tournamentMarket(t, orgMarket ? [orgMarket] : [], countryOfZone);
}

export function useViewerMarket(): MarketId {
  return marketForCountry(useRegion().country);
}
