/** Add co-hosts to an event: look someone up by name / phone / email and add
 *  them, or — if they're not on Sportfolio yet — invite them to install &
 *  register by email, WhatsApp or SMS (they're added as a pending co-host who
 *  becomes active once they register). Used at tournament creation; reusable
 *  anywhere hosts are managed. */
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import { Card, Button, TextField, SelectChip, FieldLabel, textStyles } from './ui';
import { lookupPeople, invitePerson } from '../data/repos';
import { openWhatsApp, openSms } from '../core/connect';
import { sendInviteEmail, inviteMessage, joinLink } from '../core/invite';
import type { Player } from '../core/types';

export interface CoHost { id: string; name: string; invited?: boolean }

const looksEmail = (s: string) => s.includes('@');
const looksPhone = (s: string) => s.replace(/[^0-9]/g, '').length >= 7 && /^[+\d][\d\s-]*$/.test(s.trim());

export function CoHostPicker({
  value,
  onChange,
  inviterName,
  excludeIds = [],
  context,
}: {
  value: CoHost[];
  onChange: (list: CoHost[]) => void;
  /** the current organizer's display name — used in the invite message */
  inviterName: string;
  /** ids to never offer (e.g. the creator's own id) */
  excludeIds?: string[];
  /** what they're being invited to co-host, e.g. the tournament name */
  context?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Player[]>([]);
  const [searching, setSearching] = useState(false);
  // Invite-someone-new form (shown when no existing user matches).
  const [invOpen, setInvOpen] = useState(false);
  const [iName, setIName] = useState('');
  const [iPhone, setIPhone] = useState('');
  const [iEmail, setIEmail] = useState('');
  const [busy, setBusy] = useState<null | 'email' | 'whatsapp' | 'sms'>(null);
  const [note, setNote] = useState<string | null>(null);

  const taken = new Set([...value.map((c) => c.id), ...excludeIds]);

  // Live lookup (name substring + exact phone/email), lightly debounced.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults([]); return; }
    let on = true;
    setSearching(true);
    const t = setTimeout(() => {
      lookupPeople(q).then((r) => { if (on) { setResults(r.filter((p) => !taken.has(p.id))); setSearching(false); } });
    }, 250);
    return () => { on = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, value.length]);

  const add = (p: Player) => {
    onChange([...value, { id: p.id, name: p.fullName }]);
    setQuery(''); setResults([]);
  };
  const remove = (id: string) => onChange(value.filter((c) => c.id !== id));

  const openInvite = () => {
    // Prefill the form from whatever they typed.
    const q = query.trim();
    setIName(looksEmail(q) || looksPhone(q) ? '' : q);
    setIEmail(looksEmail(q) ? q : '');
    setIPhone(looksPhone(q) ? q : '');
    setNote(null);
    setInvOpen(true);
  };

  const invite = async (channel: 'email' | 'whatsapp' | 'sms') => {
    setNote(null);
    const name = iName.trim() || query.trim();
    if (!name) return setNote('Add a name.');
    if (channel === 'email' && !iEmail.trim()) return setNote('Enter an email to invite by email.');
    if (channel !== 'email' && !iPhone.trim()) return setNote('Enter a phone number for WhatsApp / SMS.');
    setBusy(channel);
    try {
      const { player } = await invitePerson({ name, phone: iPhone.trim() || undefined, email: iEmail.trim() || undefined });
      onChange([...value, { id: player.id, name: player.fullName, invited: true }]);
      const link = joinLink(player.id);
      if (channel === 'email') {
        const sent = await sendInviteEmail(iEmail.trim(), { name: player.fullName, inviterName, link, context });
        setNote(sent ? `📧 Invite emailed to ${iEmail.trim()}.` : `📧 Opened your mail app to send ${player.fullName}'s invite.`);
      } else if (channel === 'whatsapp') {
        openWhatsApp(iPhone.trim(), inviteMessage({ name: player.fullName, inviterName, link, context }));
        setNote(`💬 Opened WhatsApp to invite ${player.fullName}.`);
      } else {
        openSms(iPhone.trim(), inviteMessage({ name: player.fullName, inviterName, link, context }));
        setNote(`✉️ Opened Messages to invite ${player.fullName}.`);
      }
      setInvOpen(false); setQuery(''); setResults([]); setIName(''); setIPhone(''); setIEmail('');
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Could not send the invite.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={{ gap: theme.spacing(2) }}>
      <View style={st.head}>
        <FieldLabel>Co-hosts (optional)</FieldLabel>
        <Text style={st.link} onPress={() => { setOpen((v) => !v); setNote(null); }}>{open ? 'Done' : '+ Add co-host'}</Text>
      </View>

      {value.length > 0 && (
        <View style={st.chips}>
          {value.map((c) => (
            <View key={c.id} style={st.hostChip}>
              <Text style={st.hostName}>{c.name}{c.invited ? ' · invited' : ''}</Text>
              <Text style={st.hostX} onPress={() => remove(c.id)}> ✕</Text>
            </View>
          ))}
        </View>
      )}

      {open && (
        <Card style={{ gap: theme.spacing(2) }}>
          <TextField label="" value={query} onChange={setQuery} placeholder="Search by name, phone or email" autoCapitalize="none" />

          {results.map((p) => (
            <TouchableOpacity key={p.id} accessibilityRole="button" activeOpacity={0.8} style={st.result} onPress={() => add(p)}>
              <View style={{ flex: 1 }}>
                <Text style={textStyles.body}>{p.fullName}</Text>
                {(p.city || p.phone) ? <Text style={textStyles.muted}>{[p.city, p.phone].filter(Boolean).join(' · ')}</Text> : null}
              </View>
              <Text style={st.add}>+ Add</Text>
            </TouchableOpacity>
          ))}

          {query.trim().length >= 2 && !searching && results.length === 0 && !invOpen && (
            <Text style={st.muted}>No one on Sportfolio matches “{query.trim()}”.</Text>
          )}

          {!invOpen ? (
            <Text style={st.link} onPress={openInvite}>➕ Invite someone new to the app</Text>
          ) : (
            <View style={{ gap: theme.spacing(2), borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: theme.spacing(2) }}>
              <Text style={textStyles.h3}>Invite to Sportfolio</Text>
              <Text style={textStyles.muted}>They’ll get a link to install the app &amp; register, and join as a co-host.</Text>
              <TextField label="Name" value={iName} onChange={setIName} placeholder="Their name" />
              <View style={st.row}>
                <View style={st.flex}><TextField label="Phone" value={iPhone} onChange={setIPhone} placeholder="+91…" autoCapitalize="none" /></View>
                <View style={st.flex}><TextField label="Email" value={iEmail} onChange={setIEmail} placeholder="name@email.com" autoCapitalize="none" /></View>
              </View>
              <View style={st.chips}>
                <Button label={busy === 'email' ? 'Sending…' : '📧 Email'} variant="ghost" onPress={() => invite('email')} disabled={!!busy} />
                <Button label={busy === 'whatsapp' ? 'Opening…' : '💬 WhatsApp'} variant="ghost" onPress={() => invite('whatsapp')} disabled={!!busy} />
                <Button label={busy === 'sms' ? 'Opening…' : '✉️ SMS'} variant="ghost" onPress={() => invite('sms')} disabled={!!busy} />
              </View>
              <Text style={st.link} onPress={() => setInvOpen(false)}>Cancel invite</Text>
            </View>
          )}

          {note ? <Text style={st.note}>{note}</Text> : null}
        </Card>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  link: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  row: { flexDirection: 'row', gap: theme.spacing(3) },
  flex: { flex: 1 },
  hostChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.pill, borderWidth: 1, borderColor: theme.colors.border, paddingVertical: theme.spacing(1), paddingHorizontal: theme.spacing(3) },
  hostName: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700' },
  hostX: { color: theme.colors.danger, fontSize: theme.font.small, fontWeight: '900' },
  result: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), paddingVertical: theme.spacing(2), borderTopWidth: 1, borderTopColor: theme.colors.border },
  add: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '800' },
  muted: { color: theme.colors.textMuted, fontSize: theme.font.small },
  note: { color: theme.colors.accent, fontSize: theme.font.small, fontWeight: '600' },
});
