/** Optional live-stream player shown at the top of the live match screen.
 *  On web it embeds YouTube/Twitch inline (16:9); on native, or for links it
 *  can't embed, it shows a tappable "watch live" card that opens the stream.
 *  Set by the organizer/scorer per match — renders nothing when no URL is set. */
import React from 'react';
import { Platform, View, Text, TouchableOpacity, Linking, StyleSheet } from 'react-native';
import { theme } from '../core/theme';

const YT = /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|live\/|embed\/|shorts\/|v\/))([\w-]{11})/;
const TWITCH = /twitch\.tv\/([A-Za-z0-9_]+)/;

export type StreamProvider = 'youtube' | 'twitch' | 'other';
export function streamProvider(url: string): StreamProvider {
  if (YT.test(url)) return 'youtube';
  if (TWITCH.test(url)) return 'twitch';
  return 'other';
}

/** The embeddable iframe src for a URL on web, or null if it can't be embedded. */
function embedSrc(url: string): string | null {
  const yt = url.match(YT);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  const tw = url.match(TWITCH);
  if (tw) {
    const host = (globalThis as { location?: { hostname?: string } })?.location?.hostname ?? 'localhost';
    return `https://player.twitch.tv/?channel=${tw[1]}&parent=${host}&autoplay=false`;
  }
  return null;
}

export function LiveStream({ url, live }: { url?: string; live?: boolean }) {
  if (!url || !url.trim()) return null;
  const provider = streamProvider(url);
  const tag = live ? '🔴 LIVE' : '▶ Stream';

  if (Platform.OS === 'web') {
    const src = embedSrc(url);
    if (src) {
      return (
        <View style={s.wrap}>
          <View style={s.video}>
            {React.createElement('iframe', {
              src,
              title: 'Live stream',
              frameBorder: '0',
              allow: 'autoplay; fullscreen; picture-in-picture; encrypted-media',
              allowFullScreen: true,
              style: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 0 },
            })}
          </View>
          <View style={s.bar}>
            <Text style={s.tag}>{tag}</Text>
            <Text style={s.provider} numberOfLines={1}>{provider === 'youtube' ? 'YouTube' : provider === 'twitch' ? 'Twitch' : 'Live'}</Text>
          </View>
        </View>
      );
    }
  }

  // Native, or a link we can't embed → a card that opens the stream externally.
  return (
    <TouchableOpacity style={s.card} activeOpacity={0.85} onPress={() => Linking.openURL(url)}>
      <Text style={s.cardIcon}>{live ? '🔴' : '▶'}</Text>
      <View style={{ flex: 1 }}>
        <Text style={s.cardTitle}>{live ? 'Watch live stream' : 'Open stream'}</Text>
        <Text style={s.cardSub} numberOfLines={1}>{url}</Text>
      </View>
      <Text style={s.cardChevron}>›</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  wrap: {
    borderRadius: theme.radius.md, overflow: 'hidden', borderWidth: 1,
    borderColor: theme.colors.border, backgroundColor: '#000',
  },
  video: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000', position: 'relative' },
  bar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: theme.spacing(2), paddingHorizontal: theme.spacing(3), backgroundColor: theme.colors.surface,
  },
  tag: { color: theme.colors.danger, fontSize: theme.font.small, fontWeight: '900', letterSpacing: 0.5 },
  provider: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '700' },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3),
    backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1,
    borderColor: theme.colors.border, padding: theme.spacing(3),
  },
  cardIcon: { fontSize: 22 },
  cardTitle: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '800' },
  cardSub: { color: theme.colors.textMuted, fontSize: theme.font.tiny },
  cardChevron: { color: theme.colors.textMuted, fontSize: theme.font.h3, fontWeight: '700' },
});
