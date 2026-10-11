/** A player's photo, or `fallback` (their initials) when there is none, it can't
 *  be shown on this device, or this viewer isn't allowed to see it — a private
 *  photo (protect_minors) is signed per viewer by useImageUri. */
import React from 'react';
import { Image, type ImageStyle, type StyleProp } from 'react-native';
import { useImageUri } from '../data/useImageUri';

export function PlayerPhoto({ url, style, fallback }: { url?: string | null; style: StyleProp<ImageStyle>; fallback: React.ReactNode }) {
  const uri = useImageUri(url);
  if (!uri) return <>{fallback}</>;
  return <Image source={{ uri }} style={style} accessibilityIgnoresInvertColors />;
}
