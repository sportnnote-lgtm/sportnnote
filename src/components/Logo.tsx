/** The SportnNote logo: the "S:N" scoreline (green S, amber colon, white N on
 *  dark). Same drawing as every app/web icon — see scripts/build-icons.mjs. */
import React from 'react';
import Svg, { Rect, Path, Circle } from 'react-native-svg';

export function Logo({ size = 32 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 200 200" accessibilityLabel="SportnNote">
      <Rect width={200} height={200} rx={44} fill="#0E1116" />
      <Path d="M80 68 H52 a16 16 0 0 0 0 32 h12 a16 16 0 0 1 0 32 H34" fill="none" stroke="#3DDC97" strokeWidth={15} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={100} cy={86} r={8} fill="#FFB454" />
      <Circle cx={100} cy={114} r={8} fill="#FFB454" />
      <Path d="M122 132 V68 L166 132 V68" fill="none" stroke="#FFFFFF" strokeWidth={15} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
