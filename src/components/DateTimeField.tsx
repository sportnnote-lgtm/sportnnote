/** A tap-to-open calendar + time picker. Pure React Native (View/Modal/Touchable)
 *  so it renders identically on iOS, Android and the web preview — no native
 *  datetime module. Holds a Date value; the caller owns it. */
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Modal, ScrollView, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import { textStyles } from './ui';

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const daysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
const pad = (n: number) => String(n).padStart(2, '0');

function formatStamp(d: Date): string {
  return d.toLocaleString(undefined, {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatDate(d: Date): string {
  return d.toLocaleDateString(undefined, {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });
}

// Bridge between the picker's Date and the YYYY-MM-DD strings the data model stores.
const toISODate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromISODate = (s: string): Date | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((s ?? '').trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
};

export function DateTimeField({
  label,
  value,
  onChange,
  mode = 'datetime',
  placeholder = 'Select…',
}: {
  label: string;
  value: Date | null;
  onChange: (d: Date) => void;
  /** 'date' hides the time wheels and closes on day-select — for date-only fields (DOB, tournament dates). */
  mode?: 'date' | 'datetime';
  /** Shown when value is null/unset. */
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  // The calendar view + any carried-over time fall back to "now" until a value is set.
  const base = value ?? new Date();
  const [viewY, setViewY] = useState(base.getFullYear());
  const [viewM, setViewM] = useState(base.getMonth());
  // Which sub-view is showing: the day grid, or a month / year pick-list.
  const [pick, setPick] = useState<'day' | 'month' | 'year'>('day');
  // Year range for the pick-list: a few years ahead (future match dates) down to
  // 1900 (old-enough DOBs), newest first. The arrows still go beyond if needed.
  const nowY = new Date().getFullYear();
  const years = Array.from({ length: nowY + 5 - 1900 + 1 }, (_, i) => nowY + 5 - i);

  function show() {
    setViewY(base.getFullYear());
    setViewM(base.getMonth());
    setPick('day');
    setOpen(true);
  }

  function step(delta: number) {
    const m = viewM + delta;
    const y = viewY + Math.floor(m / 12);
    setViewM(((m % 12) + 12) % 12);
    setViewY(y);
  }
  // Year jump — a DOB is years back, so month-only stepping is unusable.
  const stepYear = (delta: number) => setViewY((y) => y + delta);

  function pickDay(day: number) {
    onChange(new Date(viewY, viewM, day, base.getHours(), base.getMinutes()));
    if (mode === 'date') setOpen(false); // date-only: choosing a day is the whole interaction
  }

  const firstWeekday = new Date(viewY, viewM, 1).getDay();
  const total = daysInMonth(viewY, viewM);
  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: total }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const rows: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));

  const isSelectedDay = (day: number) =>
    value != null && value.getFullYear() === viewY && value.getMonth() === viewM && value.getDate() === day;

  return (
    <View style={{ gap: theme.spacing(1) }}>
      <Text style={textStyles.muted}>{label}</Text>
      <TouchableOpacity
        style={st.field}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={
          value ? `${label}: ${mode === 'date' ? formatDate(value) : formatStamp(value)}` : `${label}: not set`
        }
        accessibilityHint="Opens a picker"
        onPress={show}
      >
        <Text style={[st.fieldText, !value && st.fieldPlaceholder]}>
          {value ? `📅 ${mode === 'date' ? formatDate(value) : formatStamp(value)}` : placeholder}
        </Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={st.backdrop}>
          <View style={st.sheet}>
            <View style={st.calHead}>
              <View style={st.navGroup}>
                <TouchableOpacity onPress={() => stepYear(-1)} style={st.navBtn} hitSlop={6} accessibilityRole="button" accessibilityLabel="Previous year">
                  <Text style={st.navTxt}>«</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => step(-1)} style={st.navBtn} hitSlop={6} accessibilityRole="button" accessibilityLabel="Previous month">
                  <Text style={st.navTxt}>‹</Text>
                </TouchableOpacity>
              </View>
              <View style={st.titleGroup}>
                <TouchableOpacity onPress={() => setPick((p) => (p === 'month' ? 'day' : 'month'))} accessibilityRole="button" accessibilityLabel="Choose month">
                  <Text style={[st.monthTitle, pick === 'month' && st.titleActive]}>{MONTHS[viewM]}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setPick((p) => (p === 'year' ? 'day' : 'year'))} accessibilityRole="button" accessibilityLabel="Choose year">
                  <Text style={[st.monthTitle, pick === 'year' && st.titleActive]}>{viewY}</Text>
                </TouchableOpacity>
              </View>
              <View style={st.navGroup}>
                <TouchableOpacity onPress={() => step(1)} style={st.navBtn} hitSlop={6} accessibilityRole="button" accessibilityLabel="Next month">
                  <Text style={st.navTxt}>›</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => stepYear(1)} style={st.navBtn} hitSlop={6} accessibilityRole="button" accessibilityLabel="Next year">
                  <Text style={st.navTxt}>»</Text>
                </TouchableOpacity>
              </View>
            </View>

            {pick === 'month' && (
              <View style={st.pickWrap}>
                {MONTHS.map((m, i) => (
                  <View key={m} style={st.monthCell}>
                    <TouchableOpacity style={[st.pickBtn, i === viewM && st.pickBtnSel]} onPress={() => { setViewM(i); setPick('day'); }} accessibilityRole="button" accessibilityLabel={m} accessibilityState={{ selected: i === viewM }}>
                      <Text style={[st.pickTxt, i === viewM && st.pickTxtSel]}>{m.slice(0, 3)}</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            {pick === 'year' && (
              <ScrollView style={st.yearScroll} contentContainerStyle={st.pickWrap}>
                {years.map((y) => (
                  <View key={y} style={st.yearCell}>
                    <TouchableOpacity style={[st.pickBtn, y === viewY && st.pickBtnSel]} onPress={() => { setViewY(y); setPick('day'); }} accessibilityRole="button" accessibilityLabel={String(y)} accessibilityState={{ selected: y === viewY }}>
                      <Text style={[st.pickTxt, y === viewY && st.pickTxtSel]}>{y}</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            )}

            {pick === 'day' && (
              <>
                <View style={st.weekRow}>
                  {WEEKDAYS.map((w) => (
                    <Text key={w} style={st.weekday}>{w}</Text>
                  ))}
                </View>

                {rows.map((row, ri) => (
                  <View key={ri} style={st.weekRow}>
                    {row.map((day, ci) => (
                      <View key={ci} style={st.cell}>
                        {day != null && (
                          <TouchableOpacity
                            style={[st.day, isSelectedDay(day) && st.daySel]}
                            onPress={() => pickDay(day)}
                            activeOpacity={0.7}
                            accessibilityRole="button"
                            accessibilityLabel={`${day} ${MONTHS[viewM]} ${viewY}`}
                            accessibilityState={{ selected: isSelectedDay(day) }}
                          >
                            <Text style={[st.dayTxt, isSelectedDay(day) && st.dayTxtSel]}>{day}</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    ))}
                  </View>
                ))}

                {mode === 'datetime' && <TimeEditor value={base} onChange={onChange} />}
              </>
            )}

            <TouchableOpacity style={st.done} onPress={() => setOpen(false)} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Done">
              <Text style={st.doneTxt}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

/** Enter the exact time: type the hour & minute, nudge with ▲▼, and flip AM/PM.
 *  12-hour so it reads naturally; commits a Date on every change. */
function TimeEditor({ value, onChange }: { value: Date; onChange: (d: Date) => void }) {
  const h24 = value.getHours();
  const minute = value.getMinutes();
  const ap: 'AM' | 'PM' = h24 >= 12 ? 'PM' : 'AM';
  const h12 = ((h24 + 11) % 12) + 1;
  const at = (H: number, M: number) => new Date(value.getFullYear(), value.getMonth(), value.getDate(), (H + 24) % 24, (M + 60) % 60);
  const setH12 = (h: number, a: 'AM' | 'PM') => { let H = h % 12; if (a === 'PM') H += 12; onChange(at(H, minute)); };
  return (
    <View style={{ gap: theme.spacing(2) }}>
      <Text style={[textStyles.muted, st.timeLabel]}>Time</Text>
      <View style={st.timeControls}>
        <Stepper
          label="Hour"
          text={pad(h12)}
          onUp={() => onChange(at(h24 + 1, minute))}
          onDown={() => onChange(at(h24 - 1, minute))}
          onText={(n) => { if (n >= 1 && n <= 12) setH12(n, ap); }}
        />
        <Text style={st.colon}>:</Text>
        <Stepper
          label="Minute"
          text={pad(minute)}
          onUp={() => onChange(at(h24, minute + 1))}
          onDown={() => onChange(at(h24, minute - 1))}
          onText={(n) => { if (n >= 0 && n <= 59) onChange(at(h24, n)); }}
        />
        <View style={st.ampm}>
          {(['AM', 'PM'] as const).map((a) => (
            <TouchableOpacity key={a} style={[st.ampmChip, ap === a && st.ampmSel]} onPress={() => setH12(h12, a)} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={a} accessibilityState={{ selected: ap === a }}>
              <Text style={[st.ampmTxt, ap === a && st.ampmTxtSel]}>{a}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );
}

function Stepper({ label, text, onUp, onDown, onText }: { label: string; text: string; onUp: () => void; onDown: () => void; onText: (n: number) => void }) {
  return (
    <View style={st.stepper}>
      <TouchableOpacity style={st.stepBtn} onPress={onUp} hitSlop={6} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={`${label} up`}><Text style={st.stepTxt}>▲</Text></TouchableOpacity>
      <TextInput
        style={st.stepInput}
        accessibilityLabel={label}
        value={text}
        onChangeText={(t) => { const n = parseInt(t.replace(/\D/g, ''), 10); if (!Number.isNaN(n)) onText(n); }}
        keyboardType="number-pad"
        maxLength={2}
        selectTextOnFocus
      />
      <TouchableOpacity style={st.stepBtn} onPress={onDown} hitSlop={6} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={`${label} down`}><Text style={st.stepTxt}>▼</Text></TouchableOpacity>
    </View>
  );
}

/** String-based date-only field: takes/returns 'YYYY-MM-DD' so it drops straight
 *  into the screens whose data model stores date strings (DOB, tournament dates,
 *  academic years…). Wraps DateTimeField in date mode. */
export function DateField({
  label,
  value,
  onChange,
  placeholder = 'Select date',
}: {
  label: string;
  value: string;
  onChange: (iso: string) => void;
  placeholder?: string;
}) {
  return (
    <DateTimeField
      label={label}
      mode="date"
      placeholder={placeholder}
      value={fromISODate(value)}
      onChange={(d) => onChange(toISODate(d))}
    />
  );
}

const st = StyleSheet.create({
  field: {
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingVertical: theme.spacing(3),
    paddingHorizontal: theme.spacing(4),
  },
  fieldText: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '600' },
  fieldPlaceholder: { color: theme.colors.textMuted, fontWeight: '400' },
  backdrop: {
    flex: 1,
    backgroundColor: '#000000AA',
    justifyContent: 'center',
    alignItems: 'center', // centre horizontally so the capped sheet doesn't stretch
    padding: theme.spacing(4),
  },
  sheet: {
    width: '100%',
    maxWidth: 340, // cap on tablets/web so cells stay compact & the header/Done fit
    alignSelf: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing(4),
    gap: theme.spacing(2),
  },
  calHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navGroup: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1) },
  titleGroup: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  titleActive: { color: theme.colors.primary },
  pickWrap: { flexDirection: 'row', flexWrap: 'wrap' },
  monthCell: { width: '33.333%', padding: 3 },
  yearCell: { width: '25%', padding: 3 },
  yearScroll: { maxHeight: 230 },
  pickBtn: { paddingVertical: theme.spacing(3), borderRadius: theme.radius.sm, alignItems: 'center', backgroundColor: theme.colors.surfaceAlt },
  pickBtnSel: { backgroundColor: theme.colors.primary },
  pickTxt: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700' },
  pickTxtSel: { color: '#06120D', fontWeight: '800' },
  navBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: theme.colors.surfaceAlt,
  },
  navTxt: { color: theme.colors.text, fontSize: theme.font.h2, fontWeight: '800', lineHeight: 26 },
  monthTitle: { color: theme.colors.text, fontSize: theme.font.h3, fontWeight: '700' },
  weekRow: { flexDirection: 'row' },
  weekday: { flex: 1, textAlign: 'center', color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '700' },
  cell: { flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', padding: 2 },
  day: { width: '100%', aspectRatio: 1, borderRadius: theme.radius.sm, alignItems: 'center', justifyContent: 'center' },
  daySel: { backgroundColor: theme.colors.primary },
  dayTxt: { color: theme.colors.text, fontSize: theme.font.body },
  dayTxtSel: { color: '#06120D', fontWeight: '800' },
  timeLabel: { marginTop: theme.spacing(2) },
  timeControls: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  colon: { color: theme.colors.text, fontSize: theme.font.h2, fontWeight: '900', marginHorizontal: theme.spacing(1) },
  stepper: { alignItems: 'center', gap: theme.spacing(1) },
  stepBtn: { paddingHorizontal: theme.spacing(2), paddingVertical: 2 },
  stepTxt: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '800' },
  stepInput: {
    width: 56, textAlign: 'center', color: theme.colors.text, fontSize: theme.font.h3, fontWeight: '800',
    backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.md,
    borderWidth: 1, borderColor: theme.colors.border, paddingVertical: theme.spacing(2),
  },
  ampm: { flexDirection: 'row', gap: theme.spacing(1), marginLeft: theme.spacing(2) },
  ampmChip: {
    paddingHorizontal: theme.spacing(3), paddingVertical: theme.spacing(2),
    borderRadius: theme.radius.md, backgroundColor: theme.colors.surfaceAlt,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  ampmSel: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  ampmTxt: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '800' },
  ampmTxtSel: { color: '#06120D' },
  done: {
    marginTop: theme.spacing(3),
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing(3),
    alignItems: 'center',
  },
  doneTxt: { color: '#06120D', fontSize: theme.font.body, fontWeight: '800' },
});
