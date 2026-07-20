/** Helpers for the Connect noticeboard: listing-kind metadata, a WhatsApp
 *  deep-link opener, and a tiny "time ago" formatter. */
import { Linking } from 'react-native';
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

/** Open a WhatsApp chat with a prefilled message (falls back to a plain tel:). */
export function openWhatsApp(phone?: string, text?: string): void {
  const digits = (phone ?? '').replace(/[^0-9]/g, '');
  if (!digits) return;
  const url = `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
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
