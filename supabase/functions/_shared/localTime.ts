// SD-150: word a match time in the RECIPIENT's zone and conventions for
// reminder emails. Pure (no Deno APIs) so node tests can import it.
//
// Zone: the recipient's saved profiles.time_zone, else the tournament's venue
// zone, else India (every pilot user today; India behaviour unchanged).
// Locale: from the zone's country — en-IN for India (as before), en-US for the
// US (month first, 12-hour), en-GB / en-AU / en-SG etc. elsewhere. The zone is
// always named ("IST", "GST", "BST", "AEDT", "ET"…) so the email can't be misread.

export const FALLBACK_ZONE = 'Asia/Kolkata';

const SHORT: Record<string, [string, string]> = {
  'Asia/Kolkata': ['IST', 'IST'], 'Asia/Calcutta': ['IST', 'IST'],
  'Asia/Dubai': ['GST', 'GST'], 'Asia/Muscat': ['GST', 'GST'],
  'Asia/Qatar': ['AST', 'AST'], 'Asia/Riyadh': ['AST', 'AST'], 'Asia/Bahrain': ['AST', 'AST'], 'Asia/Kuwait': ['AST', 'AST'],
  'Europe/London': ['GMT', 'BST'],
  'Asia/Singapore': ['SGT', 'SGT'], 'Asia/Kuala_Lumpur': ['MYT', 'MYT'],
  'Australia/Sydney': ['AEST', 'AEDT'], 'Australia/Melbourne': ['AEST', 'AEDT'], 'Australia/Hobart': ['AEST', 'AEDT'],
  'Australia/Brisbane': ['AEST', 'AEST'], 'Australia/Adelaide': ['ACST', 'ACDT'], 'Australia/Darwin': ['ACST', 'ACST'],
  'Australia/Perth': ['AWST', 'AWST'],
  'America/New_York': ['ET', 'ET'], 'America/Detroit': ['ET', 'ET'], 'America/Chicago': ['CT', 'CT'],
  'America/Denver': ['MT', 'MT'], 'America/Phoenix': ['MST', 'MST'], 'America/Los_Angeles': ['PT', 'PT'],
  'America/Anchorage': ['AKT', 'AKT'], 'Pacific/Honolulu': ['HST', 'HST'],
  UTC: ['UTC', 'UTC'], 'Etc/UTC': ['UTC', 'UTC'],
};

export function isZone(z: string | null | undefined): z is string {
  if (!z) return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: z }).format(0); return true; } catch { return false; }
}

/** The zone to word an email in: recipient → venue → India. */
export function emailZone(profileZone?: string | null, tournamentZone?: string | null): string {
  if (isZone(profileZone)) return profileZone;
  if (isZone(tournamentZone)) return tournamentZone;
  return FALLBACK_ZONE;
}

/** The locale whose conventions suit a zone's country. */
export function localeForZone(zone: string): string {
  if (zone === 'Asia/Kolkata' || zone === 'Asia/Calcutta') return 'en-IN';
  if (zone.startsWith('America/') || zone === 'Pacific/Honolulu') return 'en-US';
  if (zone.startsWith('Australia/')) return 'en-AU';
  if (zone === 'Asia/Singapore') return 'en-SG';
  if (zone === 'Asia/Kuala_Lumpur' || zone === 'Asia/Kuching') return 'en-MY';
  // Gulf: day first, 12-hour (en-QA would put the month first).
  if (['Asia/Dubai', 'Asia/Muscat', 'Asia/Qatar', 'Asia/Riyadh', 'Asia/Bahrain', 'Asia/Kuwait'].includes(zone)) return 'en-AE';
  return 'en-GB';
}

function offsetMs(at: number, zone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(new Date(at));
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour') % 24, g('minute')) - Math.floor(at / 60000) * 60000;
}

/** "IST", "BST"/"GMT", "AEDT"/"AEST", "ET"…; unknown zones "GMT+x". */
export function zoneName(zone: string, at: number): string {
  const n = SHORT[zone];
  const off = offsetMs(at, zone);
  if (!n) {
    if (!off) return 'GMT';
    const m = Math.round(Math.abs(off) / 60000);
    return `GMT${off > 0 ? '+' : '-'}${Math.floor(m / 60)}${m % 60 ? `:${String(m % 60).padStart(2, '0')}` : ''}`;
  }
  if (n[0] === n[1]) return n[0];
  const y = new Date(at).getUTCFullYear();
  const jan = offsetMs(Date.UTC(y, 0, 15), zone), jul = offsetMs(Date.UTC(y, 6, 15), zone);
  return jan !== jul && off === Math.max(jan, jul) ? n[1] : n[0];
}

/** "Sat, 12 Oct, 4:30 pm IST" (en-IN) / "Sat, Oct 12, 4:30 PM ET" (en-US). */
export function emailWhen(iso: string, zone: string): string {
  const at = Date.parse(iso);
  const s = new Intl.DateTimeFormat(localeForZone(zone), {
    timeZone: zone, weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
  }).format(new Date(at));
  return `${s} ${zoneName(zone, at)}`;
}
