/** The owner-only contact card with per-channel OTP verification. For the
 *  player's own EMAIL this sends a real code (via the send-contact-otp edge
 *  function) and verifies it server-side. Phone (no SMS provider yet) and the
 *  guardian card fall back to a clearly-labelled on-screen code. */
import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import { Card, Pill, textStyles } from './ui';
import { verifyContact, beginContactVerification, verifyContactOtp } from '../data/repos';

type Channel = 'phone' | 'email';

// An in-progress verification (which channel, the sent/real state, the typed
// code) survives a remount — e.g. when the profile refetches after you switch to
// your email tab to grab the code and switch back. Keyed per card so it doesn't
// leak between the own-contact and guardian cards. Cleared once you finish/close.
type VState = { active: Channel | null; real: boolean; sent: string; code: string; reason: string | null };
const otpSession = new Map<string, VState>();

export function ContactCard({
  playerId,
  phone,
  email,
  phoneVerified,
  emailVerified,
  title = 'Contact · only you can see this',
  name,
  verify = verifyContact,
  emailOtp = false,
}: {
  playerId: string;
  phone?: string;
  email?: string;
  phoneVerified?: boolean;
  emailVerified?: boolean;
  /** card heading — e.g. "Parent / Guardian" */
  title?: string;
  /** optional name shown above the rows (the guardian's name) */
  name?: string;
  /** how a channel is marked verified — defaults to verifying the player's own */
  verify?: (playerId: string, channel: Channel) => Promise<void>;
  /** enable REAL emailed OTP for the email row (only for the player's own card) */
  emailOtp?: boolean;
}) {
  const sessionKey = `${playerId}:${title}`;
  const saved = otpSession.get(sessionKey);
  const [verified, setVerified] = useState<Record<Channel, boolean>>({
    phone: !!phoneVerified,
    email: !!emailVerified,
  });
  const [active, setActive] = useState<Channel | null>(saved?.active ?? null);
  const [code, setCode] = useState(saved?.code ?? '');
  const [sent, setSent] = useState(saved?.sent ?? '');   // the on-screen code (fallback modes only)
  const [real, setReal] = useState(saved?.real ?? false); // true ⇒ a code was actually emailed
  const [reason, setReason] = useState<string | null>(saved?.reason ?? null); // why a real send didn't happen
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Persist the open verification across remounts (see otpSession above).
  useEffect(() => {
    if (active) otpSession.set(sessionKey, { active, real, sent, code, reason });
    else otpSession.delete(sessionKey);
  }, [sessionKey, active, real, sent, code, reason]);

  const start = async (channel: Channel) => {
    setActive(channel);
    setCode('');
    setError(null);
    setSent('');
    setReal(false);
    setReason(null);
    // Real emailed OTP only for the player's own email; everything else uses the
    // on-screen code until its delivery channel is wired up.
    if (emailOtp && channel === 'email') {
      setBusy(true);
      const r = await beginContactVerification(playerId, channel);
      setBusy(false);
      if (r.sent) { setReal(true); return; }
      setSent(r.demoCode ?? '');
      setReason(r.reason ?? null);
    } else {
      setSent(String(Math.floor(100000 + Math.random() * 900000)));
    }
  };

  const confirm = async (channel: Channel) => {
    setError(null);
    if (real) {
      setBusy(true);
      const ok = await verifyContactOtp(playerId, channel, code.trim());
      setBusy(false);
      if (!ok) { setError('Incorrect or expired code — check your email and try again.'); return; }
    } else {
      if (code.trim() !== sent) { setError('Incorrect code — try again.'); return; }
      await verify(playerId, channel);
    }
    setVerified((v) => ({ ...v, [channel]: true }));
    setActive(null);
  };

  const row = (channel: Channel, icon: string, value: string) => (
    <View style={st.block}>
      <View style={st.row}>
        <Text style={st.icon}>{icon}</Text>
        <Text style={[textStyles.body, { flex: 1 }]} numberOfLines={1}>{value}</Text>
        {verified[channel] ? (
          <Pill label="✓ Verified" color={theme.colors.surfaceAlt} textColor={theme.colors.primary} />
        ) : active === channel ? null : (
          <Text style={st.verifyLink} onPress={() => start(channel)}>Verify</Text>
        )}
      </View>
      {active === channel && !verified[channel] && (
        <View style={st.otp}>
          <Text style={textStyles.muted}>
            {busy ? 'Sending a code…'
              : real ? `We emailed a 6-digit code to ${value}. Enter it below.`
              : 'Enter the 6-digit code below.'}
          </Text>
          <View style={st.otpRow}>
            <TextInput
              style={st.input}
              value={code}
              onChangeText={setCode}
              placeholder="######"
              placeholderTextColor={theme.colors.textMuted}
              keyboardType="number-pad"
              maxLength={6}
              editable={!busy}
            />
            <TouchableOpacity accessibilityRole="button" style={[st.confirmBtn, busy && { opacity: 0.5 }]} disabled={busy} activeOpacity={0.85} onPress={() => confirm(channel)}>
              <Text style={st.confirmText}>Confirm</Text>
            </TouchableOpacity>
          </View>
          {error ? (
            <Text style={st.error}>{error}</Text>
          ) : real ? (
            <Text style={st.hint}>Didn’t get it? Check spam, or tap Verify again to resend.</Text>
          ) : sent ? (
            <>
              <Text style={st.hint}>
                {channel === 'phone'
                  ? `📱 SMS codes are coming soon — for now, use this code: ${sent}`
                  : `Email delivery isn’t set up here — use this code: ${sent}`}
              </Text>
              {reason ? <Text style={st.diag}>couldn’t email — {reason}</Text> : null}
            </>
          ) : null}
        </View>
      )}
    </View>
  );

  return (
    <Card style={{ gap: theme.spacing(2) }}>
      <Text style={textStyles.muted}>{title}</Text>
      {name ? <Text style={[textStyles.body, { fontWeight: '700' }]}>{name}</Text> : null}
      {phone ? row('phone', '📞', phone) : null}
      {email ? row('email', '✉️', email) : null}
      {!phone && !email ? <Text style={textStyles.muted}>No contact added.</Text> : null}
    </Card>
  );
}

const st = StyleSheet.create({
  block: { gap: theme.spacing(2) },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  icon: { fontSize: 16 },
  verifyLink: { color: theme.colors.accent, fontSize: theme.font.small, fontWeight: '800' },
  otp: { gap: theme.spacing(1), paddingLeft: theme.spacing(6) },
  otpRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  input: {
    flex: 1, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border,
    borderRadius: theme.radius.md, paddingVertical: theme.spacing(2), paddingHorizontal: theme.spacing(3),
    color: theme.colors.text, fontSize: theme.font.body, letterSpacing: 4,
  },
  confirmBtn: { backgroundColor: theme.colors.primary, borderRadius: theme.radius.md, paddingVertical: theme.spacing(2.5), paddingHorizontal: theme.spacing(4) },
  confirmText: { color: '#06120D', fontSize: theme.font.small, fontWeight: '800' },
  hint: { color: theme.colors.textMuted, fontSize: theme.font.tiny },
  diag: { color: theme.colors.accent, fontSize: theme.font.tiny, fontWeight: '700' },
  error: { color: theme.colors.danger, fontSize: theme.font.tiny },
});
