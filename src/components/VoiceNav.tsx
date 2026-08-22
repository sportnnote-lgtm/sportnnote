/** Global voice navigation — a mic in the Home header. Say "open the England game"
 *  / "find Red vs Blue" / "go to the live match" and it resolves the spoken team
 *  names against the match list and opens that match's live page. Like the in-match
 *  voice scorer it uses the Web Speech API on web (Chrome/Edge) and falls back to a
 *  typed box everywhere else; resolution is deterministic (no LLM) so it can't open
 *  the wrong game on a mis-hear. */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import { Button, TextField } from '../components/ui';
import { useSpeech } from '../core/speech';
import { deburr } from '../sports/football/voiceCommands';
import type { Match } from '../core/types';

/** Score a match against the spoken query by how many query tokens appear in
 *  either team's full or short name; live matches win ties (you usually mean the
 *  one in progress). Returns the best match with any overlap. */
function bestMatch(query: string, matches: Match[]): Match | undefined {
  const tokens = deburr(query).split(' ').filter((t) => t.length > 2);
  if (!tokens.length) return undefined;
  let best: { m: Match; score: number } | undefined;
  for (const m of matches) {
    const hay = deburr(`${m.homeTeam.name} ${m.homeTeam.shortName} ${m.awayTeam.name} ${m.awayTeam.shortName}`);
    let score = tokens.reduce((n, t) => (hay.includes(t) ? n + 1 : n), 0);
    if (score === 0) continue;
    if (m.status === 'live') score += 0.5; // prefer the match actually in progress
    if (!best || score > best.score) best = { m, score };
  }
  return best?.m;
}

export function VoiceNav({
  matches,
  onOpenMatch,
  open: controlledOpen,
  onOpenChange,
  hideTrigger,
}: {
  matches: Match[];
  onOpenMatch: (m: Match) => void;
  /** controlled visibility — when provided, the caller owns the open state
   *  (e.g. opened from a menu row) */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** render only the panel, not the built-in mic button */
  hideTrigger?: boolean;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (o: boolean) => (onOpenChange ? onOpenChange(o) : setInternalOpen(o));
  const [text, setText] = useState('');
  const [feedback, setFeedback] = useState('');

  const resolve = (raw: string) => {
    // Strip the navigation verbs; what's left is the team/match query.
    const q = deburr(raw).replace(/\b(open|find|show|go to|take me to|pull up|start|the|match|game|please|for)\b/g, ' ').trim();
    if (!q) { setFeedback('Say e.g. “open the England game”.'); return; }
    const m = bestMatch(q, matches);
    if (m) { setFeedback(`Opening ${m.homeTeam.shortName} v ${m.awayTeam.shortName}…`); onOpenMatch(m); setOpen(false); }
    else setFeedback(`No game matching “${raw.trim()}”. Try a team name.`);
  };
  const speech = useSpeech(resolve);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (!next && speech.listening) speech.stop();
  };

  return (
    <View style={open ? sv.wrap : undefined}>
      {!hideTrigger && (
        <TouchableOpacity accessibilityRole="button" style={sv.iconBtn} activeOpacity={0.8} onPress={toggle} accessibilityLabel="Voice navigation">
          <Text style={sv.icon}>{open ? '🎙️' : '🎙'}</Text>
        </TouchableOpacity>
      )}
      {open && (
        <View style={sv.panel}>
          <Text style={sv.title}>🎙 Voice — find &amp; open a game</Text>
          <View style={{ flexDirection: 'row', gap: theme.spacing(2) }}>
            <Button
              label={speech.listening ? '🛑 Stop' : '🎤 Speak'}
              variant={speech.listening ? 'danger' : 'ghost'}
              style={{ flex: 1 }}
              onPress={() => (speech.listening ? speech.stop() : speech.supported ? speech.start() : setFeedback('Voice needs Chrome/Edge on web — type below.'))}
            />
          </View>
          {speech.interim ? (
            <Text style={sv.heard}>🎙 {speech.interim}</Text>
          ) : feedback ? (
            <Text style={sv.feedback}>{feedback}</Text>
          ) : (
            <Text style={sv.hint}>Say “open the England game”, “find Red vs Blue”, or “go to the live match”.</Text>
          )}
          <View style={{ flexDirection: 'row', gap: theme.spacing(2) }}>
            <View style={{ flex: 1 }}><TextField label="" value={text} onChange={setText} placeholder='…or type a team / "live match"' /></View>
            <Button label="Go" variant="ghost" onPress={() => { if (text.trim()) { resolve(text); setText(''); } }} disabled={!text.trim()} />
          </View>
        </View>
      )}
    </View>
  );
}

const sv = StyleSheet.create({
  wrap: { position: 'relative' },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.colors.border },
  icon: { fontSize: 18 },
  panel: { position: 'absolute', top: 46, right: 0, width: 300, zIndex: 50, gap: theme.spacing(2), backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing(3), shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
  title: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '800' },
  heard: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700', fontStyle: 'italic' },
  feedback: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '700' },
  hint: { color: theme.colors.textMuted, fontSize: theme.font.tiny },
});
