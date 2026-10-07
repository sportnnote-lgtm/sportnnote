/** Helpers for the Connect noticeboard: listing-kind metadata, a WhatsApp
 *  deep-link opener, and a tiny "time ago" formatter. */
import { Linking, Platform } from 'react-native';
import type { ListingKind } from './types';

export const LISTING_KINDS: {
  kind: ListingKind;
  icon: string;
  /** short chip/badge label */
  short: string;
  /** full label for the create form */
  label: string;
}[] = [
  { kind: 'player_seeking_team', icon: '🙋', short: 'Available player', label: "I'm a player looking for a team" },
  { kind: 'team_seeking_player', icon: '🧩', short: 'Player wanted', label: 'My team needs a player' },
  { kind: 'team_seeking_opponent', icon: '⚔️', short: 'Opponent wanted', label: 'My team wants an opponent' },
  { kind: 'team_seeking_ground', icon: '📍', short: 'Ground wanted', label: 'Looking for a ground' },
];

export const kindMeta = (kind: ListingKind) =>
  LISTING_KINDS.find((k) => k.kind === kind) ?? LISTING_KINDS[0];

/** Levels of play for opponent posts. */
export const LISTING_LEVELS = ['Friendly', 'Competitive', 'Any level'];

/** opponent & ground posts carry a preferred date; opponent posts also a level. */
export const wantsSchedule = (kind: ListingKind) =>
  kind === 'team_seeking_opponent' || kind === 'team_seeking_ground';
export const wantsLevel = (kind: ListingKind) => kind === 'team_seeking_opponent';

/** Digits with a country code: a bare 10-digit Indian mobile gets 91 (wa.me and
 *  sms need the full international number). */
export function intlDigits(phone?: string): string {
  let d = (phone ?? '').replace(/[^0-9]/g, '').replace(/^00/, '');
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  if (d.length === 10) d = `91${d}`;
  return d;
}

/** Open a WhatsApp chat with a prefilled message. */
export function openWhatsApp(phone?: string, text?: string): void {
  const digits = intlDigits(phone);
  if (!digits) return;
  const url = `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
  void Linking.openURL(url);
}

/** Open the device SMS composer to a number with a prefilled body. iPhones read
 *  the body after "&", Android after "?". */
export function openSms(phone?: string, text?: string): void {
  const digits = intlDigits(phone);
  if (!digits) return;
  const ios = Platform.OS === 'ios'
    || (Platform.OS === 'web' && typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent));
  const url = `sms:+${digits}${text ? `${ios ? '&' : '?'}body=${encodeURIComponent(text)}` : ''}`;
  void Linking.openURL(url);
}

/** "2h ago", "3d ago", "just now" from an ISO timestamp. */
export function timeAgo(iso: string, now: number): string {
  const then = new Date(iso).getTime();
  const mins = Math.max(0, Math.round((now - then) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}
