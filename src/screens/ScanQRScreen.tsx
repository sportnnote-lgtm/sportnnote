/** Scan a team QR code to join (spec §10, option 4). Opens the camera, reads a QR,
 *  extracts the club invite code from it (deep link / https link / bare code), and
 *  hands off to the Join a team screen pre-filled with the code. Camera-based, so it
 *  is a native feature; on web (no camera) it shows a graceful fallback. */
import React, { useState } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { theme } from '../core/theme';
import { Button, ScreenTitle, textStyles } from '../components/ui';
import { parseClubToken } from '../core/invite';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function ScanQRScreen() {
  const nav = useNavigation<Nav>();
  const [permission, requestPermission] = useCameraPermissions();
  const [handled, setHandled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onScan = ({ data }: { data: string }) => {
    if (handled) return;
    const token = parseClubToken(data);
    if (!token) { setError('That QR isn’t a SportnNote team invite. Try another.'); return; }
    setHandled(true);
    // Replace so Back doesn't return to the camera.
    nav.replace('JoinClub', { token });
  };

  // Web / no camera: send them to enter the code manually instead.
  if (Platform.OS === 'web') {
    return (
      <SafeAreaView style={st.safe} edges={['bottom']}>
        <View style={st.center}>
          <ScreenTitle title="Scan a team QR" subtitle="Scanning needs a camera" />
          <Text style={[textStyles.muted, st.msg]}>QR scanning works on the phone app. On the web, enter the invite code instead.</Text>
          <Button label="Enter a code" onPress={() => nav.replace('JoinClub')} />
        </View>
      </SafeAreaView>
    );
  }

  if (!permission) {
    return <SafeAreaView style={st.safe}><View style={st.center}><Text style={textStyles.muted}>Checking camera…</Text></View></SafeAreaView>;
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={st.safe} edges={['bottom']}>
        <View style={st.center}>
          <ScreenTitle title="Scan a team QR" subtitle="Camera access needed" />
          <Text style={[textStyles.muted, st.msg]}>Allow camera access to scan a team’s invite QR code.</Text>
          <Button label="Allow camera" onPress={requestPermission} />
          <Button label="Enter a code instead" variant="ghost" onPress={() => nav.replace('JoinClub')} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <View style={st.cameraWrap}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={handled ? undefined : onScan}
        />
        <View style={st.reticle} pointerEvents="none" />
        <View style={st.hintWrap} pointerEvents="none">
          <Text style={st.hint}>Point at a team’s QR code</Text>
        </View>
      </View>
      {error && <Text style={[textStyles.muted, st.err]}>{error}</Text>}
      <View style={st.footer}>
        <Button label="Enter a code instead" variant="ghost" onPress={() => nav.replace('JoinClub')} />
      </View>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: theme.spacing(3), padding: theme.spacing(4) },
  msg: { textAlign: 'center' },
  cameraWrap: { flex: 1, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  reticle: { width: 220, height: 220, borderWidth: 3, borderColor: '#ffffff', borderRadius: theme.radius.lg, opacity: 0.9 },
  hintWrap: { position: 'absolute', bottom: theme.spacing(6) },
  hint: { color: '#fff', backgroundColor: '#000000aa', paddingHorizontal: theme.spacing(3), paddingVertical: theme.spacing(2), borderRadius: theme.radius.pill, fontWeight: '700' },
  err: { textAlign: 'center', padding: theme.spacing(2), color: '#FF8A8A' },
  footer: { padding: theme.spacing(4) },
});
