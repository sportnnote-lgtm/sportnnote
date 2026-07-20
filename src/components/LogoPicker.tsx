/** A square logo/banner image for a tournament or match. Hosts can tap to set
 *  or change it; everyone else just sees it (and nothing if none is set). */
import React, { useEffect, useState } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import { pickPhoto } from '../core/photo';

export function LogoPicker({
  logoUrl,
  canManage,
  onPick,
  size = 56,
  placeholder = '🏆',
  label = 'Add logo',
}: {
  logoUrl?: string;
  canManage: boolean;
  onPick: (uri: string) => void;
  size?: number;
  placeholder?: string;
  label?: string;
}) {
  const [logo, setLogo] = useState(logoUrl);
  useEffect(() => setLogo(logoUrl), [logoUrl]);

  const change = async () => {
    const uri = await pickPhoto();
    if (!uri) return;
    setLogo(uri);
    onPick(uri);
  };

  if (!logo && !canManage) return null; // viewers see nothing when there's no logo

  return (
    <TouchableOpacity
      disabled={!canManage}
      activeOpacity={canManage ? 0.8 : 1}
      onPress={change}
      style={st.wrap}
    >
      <View style={[st.box, { width: size, height: size, borderRadius: theme.radius.md }]}>
        {logo ? (
          <Image source={{ uri: logo }} style={{ width: size, height: size }} resizeMode="cover" />
        ) : (
          <Text style={{ fontSize: size * 0.45 }}>{placeholder}</Text>
        )}
        {canManage && (
          <View style={st.cam}><Text style={st.camIcon}>📷</Text></View>
        )}
      </View>
      {canManage && !logo && <Text style={st.label}>{label}</Text>}
    </TouchableOpacity>
  );
}

const st = StyleSheet.create({
  wrap: { alignItems: 'center', gap: theme.spacing(1) },
  box: {
    backgroundColor: theme.colors.surfaceAlt, borderWidth: 1, borderColor: theme.colors.border,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  cam: {
    position: 'absolute', right: -2, bottom: -2, width: 22, height: 22, borderRadius: 11,
    backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  camIcon: { fontSize: 11 },
  label: { color: theme.colors.primary, fontSize: theme.font.tiny, fontWeight: '700' },
});
