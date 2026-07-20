/** A tap-to-open calendar + time picker. Pure React Native (View/Modal/Touchable)
 *  so it renders identically on iOS, Android and the web preview — no native
 *  datetime module. Holds a Date value; the caller owns it. */
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Modal, StyleSheet } from 'react-native';
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

  function show() {
    setViewY(base.getFullYear());
    setViewM(base.getMonth());
    setOpen(true);
  }

  function step(delta: number) {
    const m = viewM + delta;
    const y = viewY + Math.floor(m / 12);
    setViewM(((m % 12) + 12) % 12);
    setViewY(y);
  }

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
      <TouchableOpacity style={st.field} activeOpacity={0.8} onPress={show}>
        <Text style={[st.fieldText, !value && st.fieldPlaceholder]}>
          {value ? `📅 ${mode === 'date' ? formatDate(value) : formatStamp(value)}` : placeholder}
        </Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={st.backdrop}>
          <View style={st.sheet}>
            <View style={st.calHead}>
              <TouchableOpacity onPress={() => step(-1)} style={st.navBtn} hitSlop={8}>
                <Text style={st.navTxt}>‹</Text>
              </TouchableOpacity>
              <Text style={st.monthTitle}>{MONTHS[viewM]} {viewY}</Text>
              <TouchableOpacity onPress={() => step(1)} style={st.navBtn} hitSlop={8}>
                <Text style={st.navTxt}>›</Text>
              </TouchableOpacity>
            </View>

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
                      >
                        <Text style={[st.dayTxt, isSelectedDay(day) && st.dayTxtSel]}>{day}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </View>
            ))}

            {mode === 'datetime' && <TimeEditor value={base} onChange={onChange} />}

            <TouchableOpacity style={st.done} onPress={() => setOpen(false)} activeOpacity={0.85}>
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
          text={pad(h12)}
          onUp={() => onChange(at(h24 + 1, minute))}
          onDown={() => onChange(at(h24 - 1, minute))}
          onText={(n) => { if (n >= 1 && n <= 12) setH12(n, ap); }}
        />
        <Text style={st.colon}>:</Text>
        <Stepper
          text={pad(minute)}
          onUp={() => onChange(at(h24, minute + 1))}
          onDown={() => onChange(at(h24, minute - 1))}
          onText={(n) => { if (n >= 0 && n <= 59) onChange(at(h24, n)); }}
        />
        <View style={st.ampm}>
          {(['AM', 'PM'] as const).map((a) => (
            <TouchableOpacity key={a} style={[st.ampmChip, ap === a && st.ampmSel]} onPress={() => setH12(h12, a)} activeOpacity={0.8}>
              <Text style={[st.ampmTxt, ap === a && st.ampmTxtSel]}>{a}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );
}

function Stepper({ text, onUp, onDown, onText }: { text: string; onUp: () => void; onDown: () => void; onText: (n: number) => void }) {
  return (
    <View style={st.stepper}>
      <TouchableOpacity style={st.stepBtn} onPress={onUp} hitSlop={6} activeOpacity={0.7}><Text style={st.stepTxt}>▲</Text></TouchableOpacity>
      <TextInput
        style={st.stepInput}
        value={text}
        onChangeText={(t) => { const n = parseInt(t.replace(/\D/g, ''), 10); if (!Number.isNaN(n)) onText(n); }}
        keyboardType="number-pad"
        maxLength={2}
        selectTextOnFocus
      />
      <TouchableOpacity style={st.stepBtn} onPress={onDown} hitSlop={6} activeOpacity={0.7}><Text style={st.stepTxt}>▼</Text></TouchableOpacity>
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
    padding: theme.spacing(4),
  },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing(4),
    gap: theme.spacing(2),
  },
  calHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
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
