/**
 * Add a person (scorer / host) by mobile number or name.
 *  • A full mobile number that's already on SportnNote → shows them; one tap adds.
 *  • A number that isn't → "Add & invite" on WhatsApp or SMS: they're added right
 *    away (a pending player for that number) and get a message with the match
 *    link — signing up with that number makes the role theirs. Name optional:
 *    they enter it themselves when they join.
 *  • Letters → members whose name matches.
 * Exact numbers only — no one can browse other people's numbers.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import { Button, TextField, textStyles } from './ui';
import { isValidPhone } from '../core/phone';
import { looksLikeContact } from '../core/contactQuery';
import { openSms, openWhatsApp } from '../core/connect';
import { findPlayerByPhone, invitePerson, lookupPeople } from '../data/repos';
import type { Player } from '../core/types';
import { reportError } from '../core/telemetry';

export function PersonPicker({ role, excludeIds = [], onPick, inviteText }: {
  role: 'scorer' | 'host';
  excludeIds?: string[];
  /** add this player to the role */
  onPick: (player: Player) => Promise<void> | void;
  /** the invite message for someone not on SportnNote yet */
  inviteText: (name?: string) => string;
}) {
  const [q, setQ] = useState('');
  const [name, setName] = useState('');
  const [found, setFound] = useState<Player | null | undefined>(undefined); // undefined = not looked up
  const [people, setPeople] = useState<Player[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const isNumber = looksLikeContact(q) === 'phone' && isValidPhone(q);

  useEffect(() => {
    let on = true;
    setFound(undefined); setPeople([]); setError(null);
    const t = setTimeout(async () => {
      try {
        if (isNumber) {
          const p = await findPlayerByPhone(q);
          if (on) setFound(p);
        } else if (q.trim().length >= 2 && !/^[+\d\s()-]+$/.test(q.trim())) {
          const list = await lookupPeople(q);
          if (on) setPeople(list.filter((p) => !excludeIds.includes(p.id)).slice(0, 6));
        }
      } catch (e) {
        if (!on) return;
        const limited = e instanceof Error && /Too many/.test(e.message);
        if (!limited) reportError(e); // so a broken lookup reaches us, not just the user
        if (limited) {
          setError('Too many lookups — try again in a while.');
        } else if (isNumber) {
          // Still offer add & invite — saving re-checks the number, so an existing
          // member is still linked rather than duplicated.
          setFound(null);
          setError('Couldn’t check if they’re on SportnNote — you can still add & invite them below.');
        } else {
          setError('Couldn’t search just now — try again.');
        }
      }
    }, 400);
    return () => { on = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const reset = (msg: string) => { setQ(''); setName(''); setFound(undefined); setPeople([]); setDone(msg); };

  const add = async (p: Player) => {
    setBusy(true); setError(null);
    try { await onPick(p); reset(`✓ ${p.fullName} added as ${role}`); } catch { setError('Couldn’t add them — try again.'); }
    setBusy(false);
  };

  const addAndInvite = async (via: 'whatsapp' | 'sms' | 'none') => {
    // Open WhatsApp / Messages FIRST, inside the tap — browsers (iPhone Safari)
    // block opening apps after an await. The message doesn't depend on the save.
    const text = inviteText(name.trim() || undefined);
    if (via === 'whatsapp') openWhatsApp(q, text);
    if (via === 'sms') openSms(q, text);
    setBusy(true); setError(null);
    try {
      const digits = q.replace(/\D/g, '');
      // Placeholder until they join and enter their own name.
      const label = name.trim() || `Invited (…${digits.slice(-4)})`;
      const res = await invitePerson({ name: label, phone: q });
      await onPick(res.player);
      reset(via === 'none' ? `✓ Added as ${role} — let them know to join with this number` : `✓ Added as ${role} — invite opened in ${via === 'whatsapp' ? 'WhatsApp' : 'Messages'}`);
    } catch (e) {
      reportError(e);
      setError('Couldn’t add that number — try again.');
    }
    setBusy(false);
  };

  return (
    <View style={{ gap: theme.spacing(2) }}>
      <TextField label="" value={q} onChange={(v) => { setQ(v); setDone(null); }} placeholder="Mobile number or name" autoCapitalize="none" />
      {done ? <Text style={st.done}>{done}</Text> : null}
      {error ? <Text style={st.err}>{error}</Text> : null}

      {/* A full number: on SportnNote → add; not yet → add & invite. */}
      {isNumber && found === undefined && !error && <Text style={textStyles.muted}>Checking…</Text>}
      {isNumber && found && (
        excludeIds.includes(found.id)
          ? <Text style={textStyles.muted}>{found.fullName} is already a {role}.</Text>
          : (
            <TouchableOpacity accessibilityRole="button" style={st.match} activeOpacity={0.85} onPress={() => void add(found)} disabled={busy}>
              <Text style={st.matchName}>✓ {found.fullName}</Text>
              <Text style={st.matchCta}>{busy ? 'Adding…' : `Add as ${role}`}</Text>
            </TouchableOpacity>
          )
      )}
      {isNumber && found === null && (
        <View style={st.invite}>
          <Text style={textStyles.body}>Not on SportnNote yet — add them and send an invite:</Text>
          <TextField label="" value={name} onChange={setName} placeholder="Their name (optional — they’ll add it when they join)" autoCapitalize="words" />
          <Button label={busy ? 'Adding…' : '💬 Add & invite on WhatsApp'} onPress={() => void addAndInvite('whatsapp')} disabled={busy} />
          <Button label="✉️ Add & invite by SMS" variant="ghost" onPress={() => void addAndInvite('sms')} disabled={busy} />
          <Text style={st.link} onPress={() => void addAndInvite('none')}>Just add — I’ll tell them myself</Text>
        </View>
      )}

      {/* Name search → members. */}
      {people.map((p) => (
        <TouchableOpacity key={p.id} accessibilityRole="button" style={st.opt} activeOpacity={0.8} onPress={() => void add(p)} disabled={busy}>
          <Text style={st.optText}>＋ {p.fullName}{p.city ? ` · ${p.city}` : ''}</Text>
        </TouchableOpacity>
      ))}
      {!isNumber && q.trim().length >= 2 && people.length === 0 && !/^[+\d\s()-]+$/.test(q.trim()) && (
        <Text style={textStyles.muted}>No members by that name — try their mobile number to invite them.</Text>
      )}
      {/^[+\d\s()-]+$/.test(q.trim()) && !isNumber && q.replace(/\D/g, '').length > 0 && (
        <Text style={textStyles.muted}>Enter the full 10-digit mobile number.</Text>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  match: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: theme.spacing(3), borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.primary, backgroundColor: theme.colors.primary + '18' },
  matchName: { color: theme.colors.text, fontWeight: '800', fontSize: theme.font.body, flex: 1 },
  matchCta: { color: theme.colors.primary, fontWeight: '800', fontSize: theme.font.small },
  invite: { gap: theme.spacing(2), padding: theme.spacing(3), borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt },
  link: { color: theme.colors.textMuted, fontWeight: '700', fontSize: theme.font.small, textAlign: 'center' },
  opt: { paddingVertical: theme.spacing(2), borderTopWidth: 1, borderTopColor: theme.colors.border },
  optText: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '600' },
  done: { color: theme.colors.primary, fontWeight: '700', fontSize: theme.font.small },
  err: { color: theme.colors.danger, fontSize: theme.font.small },
});
