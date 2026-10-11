/**
 * Edge-function region pinning for people outside India (perf audit F-22,
 * docs/international/latency.md step 3).
 *
 * An edge function runs at the edge nearest the caller, then makes several
 * round trips to the database in Mumbai. For someone in the UK or the US that
 * is several long hops; pinned to ap-south-1 it is one long hop and the rest
 * are local to the database.
 *
 * - India: nothing changes (no pin) — Indian users are already served from
 *   ap-south-1 (measured).
 * - Outside India: the database-heavy functions are pinned with the
 *   `forceFunctionRegion` query parameter. Not the `x-region` header that
 *   supabase-js's `region` option also sends: that header isn't in the
 *   functions' CORS allow-list, so the web app's preflight would fail. The
 *   query parameter alone pins the region (checked live: an OPTIONS with
 *   `?forceFunctionRegion=eu-west-2` answered from `x-sb-edge-region: eu-west-2`)
 *   and needs no function deploy.
 * - Never pinned: push-send and message-notify — their work is calling global
 *   push services, not the database.
 *
 * "Outside India" = the saved country (Settings → Region) when there is one,
 * else the device time zone, else the resolved region. A device zone we don't
 * map to a market (Europe/Berlin) resolves to India for dates etc., but it is
 * clearly not in India, so it is pinned too.
 */
export const PINNED_REGION = 'ap-south-1';

const INDIA_ZONES = new Set(['Asia/Kolkata', 'Asia/Calcutta']);

/** The functions that are mostly database work (pinned for people abroad). */
export const PINNED_FUNCTIONS: ReadonlySet<string> = new Set([
  'phone-login',
  'verification-submit',
  'send-invite',
  'join',
  'report-invite',
  'delete-account',
  'support-assistant',
  'support-escalate',
  'guardian-consent',
  'guardian-link',
  'send-contact-otp',
  'verify-contact-otp',
  'verify-phone-firebase',
]);

export interface WhereFrom {
  /** the country saved in Settings → Region, if any */
  savedCountry?: string | null;
  /** the device's IANA time zone, if known */
  deviceZone?: string;
  /** the region in force (saved, else device, else India) */
  country: string;
}

/** True when this person is outside India (see the header). Pure. */
export function outsideIndia(w: WhereFrom): boolean {
  if (w.savedCountry) return w.savedCountry !== 'IN';
  if (w.deviceZone) return !INDIA_ZONES.has(w.deviceZone);
  return w.country !== 'IN';
}

/** The function path to invoke: `name`, or `name?forceFunctionRegion=ap-south-1`
 *  (`&` when `name` already has a query) for pinned functions abroad. Pure. */
export function regionalFunctionPath(name: string, abroad: boolean): string {
  const base = name.split('?')[0];
  if (!abroad || !PINNED_FUNCTIONS.has(base)) return name;
  return `${name}${name.includes('?') ? '&' : '?'}forceFunctionRegion=${PINNED_REGION}`;
}
