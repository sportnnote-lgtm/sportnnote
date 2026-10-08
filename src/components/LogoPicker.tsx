/** A logo / banner image for a tournament, match, team or community. Hosts tap
 *  to set or change it — the image uploads (repos.uploadImage) so everyone sees
 *  it; everyone else just sees it (and nothing if none is set). */
import React, { useEffect, useState } from 'react';
import { View, Text, Image, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import { pickImage } from '../core/photo';
import { notice } from '../core/confirm';
import { isSupabaseConfigured } from '../core/supabase';
import { displayableImage, type ImageKind } from '../core/imageUrl';
import { uploadImage } from '../data/repos';

export function LogoPicker({
  logoUrl,
  canManage,
  onPick,
  kind,
  aspect,
  shape = 'square',
  size = 56,
  placeholder = '🏆',
  label = 'Add logo',
}: {
  logoUrl?: string;
  canManage: boolean;
  /** save the uploaded URL; throw to revert (e.g. not allowed) */
  onPick: (url: string) => void | Promise<void>;
  kind: ImageKind;
  aspect?: [number, number];
  /** 'banner' = full width, 3:1 */
  shape?: 'square' | 'circle' | 'banner';
  size?: number;
  placeholder?: string;
  label?: string;
}) {
  const [logo, setLogo] = useState(logoUrl);
  const [uploading, setUploading] = useState(false);
  useEffect(() => setLogo(logoUrl), [logoUrl]);

  const change = async () => {
    const img = await pickImage({ aspect: aspect ?? (shape === 'banner' ? [3, 1] : [1, 1]) });
    if (!img) return;
    const before = logo;
    setLogo(img.uri); // dimmed preview while it uploads
    setUploading(true);
    try {
      const url = await uploadImage(img, kind);
      await onPick(url);
      setLogo(url);
    } catch (e) {
      setLogo(before);
      notice('Couldn’t save the image', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setUploading(false);
    }
  };

  // Live: an old device-local URI can't be shown here — treat it as unset.
  const shown = displayableImage(logo, !isSupabaseConfigured || uploading);
  if (!shown && !canManage) return null; // viewers see nothing when there's no image

  const banner = shape === 'banner';
  const box = banner
    ? shown
      ? { width: '100%' as const, aspectRatio: 3, maxHeight: 220, borderRadius: theme.radius.md }
      : { width: '100%' as const, height: 44, borderRadius: theme.radius.md, borderStyle: 'dashed' as const } // slim "＋ Add banner" strip
    : { width: size, height: size, borderRadius: shape === 'circle' ? size / 2 : theme.radius.md };

  return (
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={canManage ? (shown ? `Change ${banner ? 'banner' : 'logo'}` : label) : undefined}
      disabled={!canManage || uploading}
      activeOpacity={canManage ? 0.8 : 1}
      onPress={change}
      style={[st.wrap, banner && { alignSelf: 'stretch' }]}
    >
      <View style={[st.box, box]}>
        {shown ? (
          <Image source={{ uri: shown }} style={[StyleSheet.absoluteFill, uploading && { opacity: 0.4 }]} resizeMode="cover" />
        ) : banner ? (
          <Text style={st.bannerAdd}>＋ {label}</Text>
        ) : (
          <Text style={{ fontSize: size * 0.45 }}>{placeholder}</Text>
        )}
        {uploading && <ActivityIndicator color={theme.colors.primary} />}
        {canManage && !uploading && !(banner && !shown) && (
          <View style={st.cam}><Text style={st.camIcon}>📷</Text></View>
        )}
      </View>
      {canManage && !shown && !banner && <Text style={st.label}>{label}</Text>}
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
    position: 'absolute', right: 4, bottom: 4, width: 22, height: 22, borderRadius: 11,
    backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  camIcon: { fontSize: 11 },
  bannerAdd: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '800' },
  label: { color: theme.colors.primary, fontSize: theme.font.tiny, fontWeight: '700' },
});
