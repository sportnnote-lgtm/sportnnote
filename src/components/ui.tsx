/** Small shared UI primitives so screens and sport plugins stay consistent. */
import React from 'react';
import {
  ActivityIndicator,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  StyleSheet,
  ViewStyle,
  TextStyle,
  StyleProp,
} from 'react-native';
import { theme } from '../core/theme';

/** Shown while data is still being fetched, so a list never flashes its
 *  "nothing here yet" empty state before the real content arrives. */
export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <View style={loadingStyles.wrap} accessibilityRole="progressbar" accessibilityLabel={label}>
      <ActivityIndicator color={theme.colors.primary} />
      <Text style={loadingStyles.label}>{label}</Text>
    </View>
  );
}

const loadingStyles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', gap: theme.spacing(2), paddingVertical: theme.spacing(6) },
  label: { color: theme.colors.textMuted, fontSize: theme.font.small },
});

export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  style,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'ghost' | 'home' | 'away' | 'danger';
  style?: ViewStyle;
  disabled?: boolean;
}) {
  const bg =
    variant === 'primary'
      ? theme.colors.primary
      : variant === 'home'
      ? theme.colors.home
      : variant === 'away'
      ? theme.colors.away
      : variant === 'danger'
      ? theme.colors.danger
      : 'transparent';
  const fg = variant === 'ghost' ? theme.colors.text : '#06120D';
  return (
    <TouchableOpacity
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      activeOpacity={0.85}
      style={[
        styles.btn,
        { backgroundColor: bg },
        variant === 'ghost' && styles.btnGhost,
        disabled && styles.btnDisabled,
        style,
      ]}
    >
      <Text style={[styles.btnText, { color: fg }]}>{label}</Text>
    </TouchableOpacity>
  );
}

export function Pill({
  label,
  color = theme.colors.surfaceAlt,
  textColor = theme.colors.textMuted,
}: {
  label: string;
  color?: string;
  textColor?: string;
}) {
  return (
    <View style={[styles.pill, { backgroundColor: color }]}>
      <Text style={[styles.pillText, { color: textColor }]}>{label}</Text>
    </View>
  );
}

export function ScreenTitle({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <View style={{ marginBottom: theme.spacing(4) }}>
      <Text style={textStyles.h1}>{title}</Text>
      {subtitle ? <Text style={textStyles.muted}>{subtitle}</Text> : null}
    </View>
  );
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  autoCapitalize = 'sentences',
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  multiline?: boolean;
}) {
  return (
    <View style={{ gap: theme.spacing(1) }}>
      <Text style={textStyles.muted}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && styles.inputMultiline]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.textMuted}
        autoCapitalize={autoCapitalize}
        multiline={multiline}
        numberOfLines={multiline ? 4 : undefined}
        textAlignVertical={multiline ? 'top' : 'center'}
      />
    </View>
  );
}

/** A toggleable chip for single/multi selects in forms. `disabled` grays it out
 *  and blocks taps (e.g. a dismissed batsman who can't be picked again). */
export function SelectChip({
  label,
  active,
  onPress,
  dotColor,
  disabled = false,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  dotColor?: string;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      activeOpacity={0.8}
      style={[styles.selChip, active && styles.selChipActive, disabled && styles.selChipDisabled]}
    >
      {dotColor ? <View style={[styles.selDot, { backgroundColor: dotColor }]} /> : null}
      <Text style={[styles.selChipText, active && styles.selChipTextActive, disabled && styles.selChipTextDisabled]}>{label}</Text>
    </TouchableOpacity>
  );
}

export const textStyles: Record<string, TextStyle> = StyleSheet.create({
  h1: { color: theme.colors.text, fontSize: theme.font.h1, fontWeight: '800' },
  h2: { color: theme.colors.text, fontSize: theme.font.h2, fontWeight: '700' },
  h3: { color: theme.colors.text, fontSize: theme.font.h3, fontWeight: '700' },
  body: { color: theme.colors.text, fontSize: theme.font.body },
  muted: { color: theme.colors.textMuted, fontSize: theme.font.small },
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing(4),
  },
  btn: {
    paddingVertical: theme.spacing(3),
    paddingHorizontal: theme.spacing(4),
    borderRadius: theme.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnGhost: { borderWidth: 1, borderColor: theme.colors.border },
  btnDisabled: { opacity: 0.4 },
  btnText: { fontSize: theme.font.body, fontWeight: '700' },
  pill: {
    paddingVertical: theme.spacing(1),
    paddingHorizontal: theme.spacing(2.5),
    borderRadius: theme.radius.pill,
    alignSelf: 'flex-start',
  },
  pillText: { fontSize: theme.font.tiny, fontWeight: '700' },
  input: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing(3),
    paddingHorizontal: theme.spacing(3),
    color: theme.colors.text,
    fontSize: theme.font.body,
  },
  inputMultiline: { minHeight: 96, paddingTop: theme.spacing(3) },
  selChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing(2),
    paddingVertical: theme.spacing(2),
    paddingHorizontal: theme.spacing(3.5),
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  selChipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  selChipDisabled: { opacity: 0.4, backgroundColor: theme.colors.surfaceAlt },
  selChipText: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700' },
  selChipTextActive: { color: '#06120D' },
  selChipTextDisabled: { textDecorationLine: 'line-through' },
  selDot: { width: 10, height: 10, borderRadius: 5 },
});
