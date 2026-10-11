/**
 * PhoneField — the one phone-number input. A dial-code chip (🇮🇳 +91 by default
 * for Indian users; the user's / device's country otherwise) plus the local
 * number. `onChange` always receives an international value — E.164
 * (`+919876543210`) once the number is valid, else `+<code> <digits>` while
 * typing — so nothing downstream ever has to guess the country.
 * Pasting a number that starts with + or 00 switches the chip to its country.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View, type StyleProp, type TextStyle } from 'react-native';
import { theme } from '../core/theme';
import {
  type CountryCode, countryFlag, countryName, defaultPhoneCountry, dialCode, examplePhone,
  isValidPhone, joinPhone, phoneCountries, setPreferredPhoneCountry, setSavedCountrySource, splitPhone,
} from '../core/phone';
import { regionStore } from '../core/region';

// The saved Settings → Region country is the default dial code (when set).
setSavedCountrySource(() => regionStore.prefs().country);

export function PhoneField({
  label,
  value,
  onChange,
  hint,
  defaultCountry,
  optional = false,
  labelStyle,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  /** Extra line under the field (e.g. "Used for sign-in"). */
  hint?: string;
  /** Country for a bare local number; default: the user's / device's country. */
  defaultCountry?: CountryCode;
  /** Optional fields don't nag while empty. */
  optional?: boolean;
  /** Match a screen's own label style (e.g. the sign-in form's muted labels). */
  labelStyle?: StyleProp<TextStyle>;
}) {
  const initial = useMemo(() => splitPhone(value, defaultCountry ?? defaultPhoneCountry()), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [country, setCountry] = useState<CountryCode>(initial.country);
  const [national, setNational] = useState(initial.national);
  const [touched, setTouched] = useState(false);
  const [picking, setPicking] = useState(false);
  const lastEmitted = useRef(value);

  // A value set from outside (profile loaded, form reset) re-seeds the field.
  useEffect(() => {
    if (value === lastEmitted.current) return;
    lastEmitted.current = value;
    const s = splitPhone(value, country);
    setCountry(s.country);
    setNational(s.national);
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const emit = (c: CountryCode, n: string) => {
    const v = joinPhone(c, n);
    lastEmitted.current = v;
    onChange(v);
  };

  const onText = (t: string) => {
    // A pasted/typed international number: move its country into the chip.
    if (/^\s*(\+|00)/.test(t)) {
      const s = splitPhone(t.replace(/^\s*00/, '+'), country);
      if (s.national !== t) {
        setCountry(s.country);
        setNational(s.national);
        emit(s.country, s.national);
        return;
      }
    }
    setNational(t);
    emit(country, t);
  };

  const pick = (c: CountryCode) => {
    setCountry(c);
    setPreferredPhoneCountry(c);
    setPicking(false);
    emit(c, national);
  };

  const v = joinPhone(country, national);
  const bad = touched && national.trim() !== '' && !isValidPhone(v);
  const example = examplePhone(country);
  const a11y = `${label}. Country code ${dialCode(country)}, ${countryName(country)}`;

  return (
    <View style={{ gap: theme.spacing(1) }}>
      {label ? <Text style={[st.label, labelStyle]}>{label}{optional ? <Text style={st.opt}>  (optional)</Text> : null}</Text> : null}
      <View style={[st.row, bad && st.rowBad]}>
        <TouchableOpacity
          onPress={() => setPicking(true)}
          style={st.chip}
          accessibilityRole="button"
          accessibilityLabel={`Country code ${dialCode(country)}, ${countryName(country)}. Change country`}
          activeOpacity={0.8}
        >
          <Text style={st.chipText}>{countryFlag(country)} {dialCode(country)}</Text>
          <Text style={st.caret}>▾</Text>
        </TouchableOpacity>
        <TextInput
          style={st.input}
          accessibilityLabel={a11y}
          value={national}
          onChangeText={onText}
          onBlur={() => setTouched(true)}
          placeholder={example || 'Mobile number'}
          placeholderTextColor={theme.colors.textMuted}
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
          autoComplete="tel"
          autoCapitalize="none"
        />
      </View>
      {bad ? (
        <Text style={st.err} accessibilityRole="alert">
          That doesn’t look like a {countryName(country)} number{example ? ` — e.g. ${example}` : ''}. Wrong country? Tap {dialCode(country)}.
        </Text>
      ) : hint ? <Text style={st.hint}>{hint}</Text> : null}

      <Modal visible={picking} transparent animationType="fade" onRequestClose={() => setPicking(false)}>
        <Pressable style={st.backdrop} onPress={() => setPicking(false)}>
          <Pressable style={st.sheet} onPress={(e) => e.stopPropagation()}>
            <CountryList current={country} onPick={pick} />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function CountryList({ current, onPick }: { current: CountryCode; onPick: (c: CountryCode) => void }) {
  const [q, setQ] = useState('');
  const all = phoneCountries();
  const needle = q.trim().toLowerCase().replace(/^\+/, '');
  const list = needle
    ? all.filter((c) => c.name.toLowerCase().includes(needle) || c.code.toLowerCase() === needle || c.dial.slice(1).startsWith(needle))
    : all;
  return (
    <View style={{ gap: theme.spacing(2), flex: 1 }}>
      <Text style={st.sheetTitle}>Country code</Text>
      <TextInput
        style={st.search}
        value={q}
        onChangeText={setQ}
        placeholder="Search country or code"
        placeholderTextColor={theme.colors.textMuted}
        accessibilityLabel="Search country or code"
        autoCapitalize="none"
        autoCorrect={false}
      />
      <FlatList
        data={list}
        keyExtractor={(c) => c.code}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={20}
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => onPick(item.code)}
            style={[st.item, item.code === current && st.itemActive]}
            accessibilityRole="button"
            accessibilityState={{ selected: item.code === current }}
            accessibilityLabel={`${item.name} ${item.dial}`}
          >
            <Text style={st.itemFlag}>{item.flag}</Text>
            <Text style={st.itemName} numberOfLines={1}>{item.name}</Text>
            <Text style={st.itemDial}>{item.dial}</Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const st = StyleSheet.create({
  label: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700' },
  opt: { color: theme.colors.textMuted, fontWeight: '400' },
  hint: { color: theme.colors.textMuted, fontSize: theme.font.tiny, lineHeight: theme.font.tiny * 1.4 },
  err: { color: theme.colors.danger, fontSize: theme.font.tiny, lineHeight: theme.font.tiny * 1.4 },
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    overflow: 'hidden',
  },
  rowBad: { borderColor: theme.colors.danger + 'AA' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing(1),
    paddingHorizontal: theme.spacing(3),
    backgroundColor: theme.colors.surfaceAlt,
    borderRightWidth: 1,
    borderRightColor: theme.colors.border,
  },
  chipText: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '600' },
  caret: { color: theme.colors.textMuted, fontSize: theme.font.tiny },
  input: {
    flex: 1,
    minWidth: 0,
    paddingVertical: theme.spacing(3),
    paddingHorizontal: theme.spacing(3),
    color: theme.colors.text,
    fontSize: theme.font.body,
  },
  backdrop: { flex: 1, backgroundColor: '#000A', justifyContent: 'center', padding: theme.spacing(4) },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing(4),
    maxHeight: '80%',
    height: 520,
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
  },
  sheetTitle: { color: theme.colors.text, fontSize: theme.font.h3, fontWeight: '700' },
  search: {
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing(2.5),
    paddingHorizontal: theme.spacing(3),
    color: theme.colors.text,
    fontSize: theme.font.body,
  },
  item: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3), paddingVertical: theme.spacing(2.5), paddingHorizontal: theme.spacing(2), borderRadius: theme.radius.sm },
  itemActive: { backgroundColor: theme.colors.primary + '22' },
  itemFlag: { fontSize: 20 },
  itemName: { flex: 1, color: theme.colors.text, fontSize: theme.font.body },
  itemDial: { color: theme.colors.textMuted, fontSize: theme.font.body, fontVariant: ['tabular-nums'] },
});
