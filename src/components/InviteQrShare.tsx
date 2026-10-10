/** The invite QR + "Share QR + message" (SD-108). One component for team (club)
 *  and tournament invites: shows the QR (it encodes the same https join link the
 *  message carries) and shares the QR image together with the WhatsApp text.
 *  `shareRef` lets the screen trigger the same share right after creating a code. */
import React, { useImperativeHandle, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { theme } from '../core/theme';
import { Button, textStyles } from './ui';
import { shareInviteWithQr, type InviteShareResult } from '../core/shareInvite';
import { inviteQrFileName, inviteQrPayload } from '../core/inviteText';

export type InviteQrShareHandle = { share: () => Promise<InviteShareResult> };

const NOTE: Partial<Record<InviteShareResult, string>> = {
  'downloaded': 'QR image saved — attach it in WhatsApp with the message.',
  'needs-tap': 'Tap “Share QR + message” to send it.',
  'failed': 'Couldn’t open sharing — show the QR or send the code.',
};

export function InviteQrShare({ kind, name, token, message, caption, size = 168, shareRef }: {
  kind: 'club' | 'tournament';
  name: string;
  token: string;
  message: string;
  /** two short lines printed under the QR in the shared image (web) */
  caption?: string[];
  size?: number;
  shareRef?: React.Ref<InviteQrShareHandle>;
}) {
  const svg = useRef<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const value = inviteQrPayload(kind, token);

  const share = async (): Promise<InviteShareResult> => {
    setBusy(true); setNote(null);
    try {
      const r = await shareInviteWithQr({ message, qrValue: value, fileName: inviteQrFileName(kind, name, token), caption, svgRef: svg.current });
      setNote(NOTE[r] ?? null);
      return r;
    } finally { setBusy(false); }
  };
  useImperativeHandle(shareRef, () => ({ share }));

  return (
    <View style={st.wrap}>
      <View style={st.qrBox} accessibilityLabel={`QR code for ${token}`}>
        <QRCode value={value} size={size} backgroundColor="#ffffff" color="#04150F" quietZone={8} getRef={(r: unknown) => { svg.current = r; }} />
      </View>
      <Button label={busy ? 'Opening…' : '📤 Share QR + message'} onPress={() => void share()} disabled={busy} />
      {note ? <Text style={[textStyles.muted, st.note]}>{note}</Text> : null}
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { alignItems: 'center', gap: theme.spacing(2), alignSelf: 'stretch' },
  qrBox: { backgroundColor: '#ffffff', padding: theme.spacing(3), borderRadius: theme.radius.md },
  note: { textAlign: 'center', fontSize: theme.font.small },
});
