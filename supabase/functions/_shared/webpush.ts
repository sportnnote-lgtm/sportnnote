/**
 * Web push (migration 0031): send to the browser subscriptions of profiles —
 * iPhone Home Screen web apps (iOS 16.4+), Android/desktop browsers.
 * Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:).
 * Expired subscriptions (404/410) are deleted. Never throws.
 */
import webpush from 'npm:web-push@3.6.7';
import { admin } from './guard.ts';

const PUB = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
const PRIV = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
const SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:sportnnote@gmail.com';
const ready = !!(PUB && PRIV);
if (ready) webpush.setVapidDetails(SUBJECT, PUB, PRIV);

export interface WebPushItem {
  profileId: string;
  title: string;
  body: string;
  /** app path to open on tap, e.g. "/m/<matchId>" */
  url?: string;
  /** same tag replaces an earlier notification (e.g. one per match) */
  tag?: string;
}

/** Send each item to every web subscription of its profile. Returns deliveries. */
export async function webPushMany(items: WebPushItem[]): Promise<number> {
  if (!ready || !items.length) return 0;
  try {
    const ids = [...new Set(items.map((i) => i.profileId))];
    const { data: subs } = await admin.from('web_push_subscriptions').select('endpoint, profile_id, p256dh, auth').in('profile_id', ids);
    if (!subs?.length) return 0;
    const byProfile = new Map<string, typeof subs>();
    for (const s of subs) byProfile.set(s.profile_id as string, [...(byProfile.get(s.profile_id as string) ?? []), s]);

    let sent = 0;
    const dead: string[] = [];
    const ok: string[] = [];
    await Promise.all(items.flatMap((it) => (byProfile.get(it.profileId) ?? []).map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint as string, keys: { p256dh: s.p256dh as string, auth: s.auth as string } },
          JSON.stringify({ title: it.title, body: it.body, url: it.url ?? '/', tag: it.tag }),
          { TTL: 60 * 60 * 6, urgency: 'high' },
        );
        sent++;
        ok.push(s.endpoint as string);
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) dead.push(s.endpoint as string);
        else console.error('web push failed', code ?? (e as Error).message);
      }
    })));
    if (dead.length) await admin.from('web_push_subscriptions').delete().in('endpoint', dead);
    if (ok.length) await admin.from('web_push_subscriptions').update({ last_ok_at: new Date().toISOString() }).in('endpoint', [...new Set(ok)]);
    return sent;
  } catch (e) {
    console.error('webPushMany', e);
    return 0;
  }
}

export const webPushToProfiles = (profileIds: string[], msg: Omit<WebPushItem, 'profileId'>) =>
  webPushMany(profileIds.map((profileId) => ({ profileId, ...msg })));
