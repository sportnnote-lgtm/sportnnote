/** A tap-to-open calendar + time picker. Pure React Native (View/Modal/Touchable)
 *  so it renders identically on iOS, Android and the web preview — no native
 *  datetime module. Holds a Date value; the caller owns it.
 *
 *  SD-150: in 'datetime' mode the day and time are WALL TIME IN A ZONE — the
 *  `timeZone` prop (pass the tournament's venue zone) or else the app's zone —
 *  the same clock the app displays, so 16:00 typed is 16:00 shown. The week
 *  starts on the region's first day and the hour is 12-hour (AM/PM) or 24-hour
 *  per the region. 'date' mode is a plain calendar date (no zone). */
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Modal, ScrollView, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import { textStyles } from './ui';
import { formatDateTime, isoToWall, useUserTimeZone, wallTimeToIso, zoneLabel } from '../core/time';
import { useRegion, weekdayOrder, leadingBlanks } from '../core/region';

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const daysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
const pad = (n: number) => String(n).padStart(2, '0');

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
  timeZone,
}: {
  label: string;
  value: Date | null;
  onChange: (d: Date) => void;
  /** 'date' hides the time wheels and closes on day-select — for date-only fields (DOB, tournament dates). */
  mode?: 'date' | 'datetime';
  /** Shown when value is null/unset. */
  placeholder?: string;
  /** 'datetime' only: the zone the wall time is in (default: the app's zone). */
  timeZone?: string;
}) {
  const [open, setOpen] = useState(false);
  const appZone = useUserTimeZone();
  const region = useRegion();
  const zoned = mode === 'datetime';
  const z = timeZone || appZone;
  // Wall date/time of an instant: in the zone (datetime) or the device calendar (date).
  const wallOf = (d: Date) => (zoned ? isoToWall(d, z) : { date: toISODate(d), time: `${pad(d.getHours())}:${pad(d.getMinutes())}` });
  const fromWall = (date: string, time: string): Date => {
    if (zoned) return new Date(wallTimeToIso(date, time, z));
    const [y, m, d] = date.split('-').map(Number);
    const [h, mi] = time.split(':').map(Number);
    return new Date(y, m - 1, d, h, mi);
  };
  const stamp = (d: Date) => (zoned ? formatDateTime(d.toISOString(), z) : formatDate(d));
  // The calendar view + any carried-over time fall back to "now" until a value is set.
  const base = value ?? new Date();
  const baseWall = wallOf(base);
  const baseY = Number(baseWall.date.slice(0, 4));
  const baseM = Number(baseWall.date.slice(5, 7)) - 1;
  const [viewY, setViewY] = useState(baseY);
  const [viewM, setViewM] = useState(baseM);
  // Which sub-view is showing: the day grid, or a month / year pick-list.
  const [pick, setPick] = useState<'day' | 'month' | 'year'>('day');
  // Year range for the pick-list: a few years ahead (future match dates) down to
  // 1900 (old-enough DOBs), newest first. The arrows still go beyond if needed.
  const nowY = new Date().getFullYear();
  const years = Array.from({ length: nowY + 5 - 1900 + 1 }, (_, i) => nowY + 5 - i);

  function show() {
    setViewY(baseY);
    setViewM(baseM);
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
    onChange(fromWall(`${viewY}-${pad(viewM + 1)}-${pad(day)}`, baseWall.time));
    if (mode === 'date') setOpen(false); // date-only: choosing a day is the whole interaction
  }

  const firstWeekday = new Date(viewY, viewM, 1).getDay();
  const total = daysInMonth(viewY, viewM);
  const cells: (number | null)[] = [
    ...Array.from({ length: leadingBlanks(firstWeekday, region.weekStart) }, () => null),
    ...Array.from({ length: total }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const rows: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));

  const selectedDate = value ? wallOf(value).date : '';
  const isSelectedDay = (day: number) => selectedDate === `${viewY}-${pad(viewM + 1)}-${pad(day)}`;

  return (
    <View style={{ gap: theme.spacing(1) }}>
      <Text style={textStyles.muted}>{label}</Text>
      <TouchableOpacity
        style={st.field}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={
          value ? `${label}: ${stamp(value)}` : `${label}: not set`
        }
        accessibilityHint="Opens a picker"
        onPress={show}
      >
        <Text style={[st.fieldText, !value && st.fieldPlaceholder]}>
          {value ? `📅 ${stamp(value)}` : placeholder}
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
                  {weekdayOrder(WEEKDAYS, region.weekStart).map((w) => (
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

                {zoned && (
                  <>
                    <TimeEditor time={baseWall.time} hour12={region.entryHour12} onChange={(t) => onChange(fromWall(baseWall.date, t))} />
                    <Text style={[textStyles.muted, st.zoneNote]}>Times in {zoneLabel(z)}</Text>
                  </>
                )}
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

/** Enter the exact time: type the hour & minute, nudge with ▲▼, and (12-hour
 *  regions) flip AM/PM. Works on a wall time 'HH:MM'; the field converts it. */
function TimeEditor({ time, hour12, onChange }: { time: string; hour12: boolean; onChange: (t: string) => void }) {
  const [h24, minute] = time.split(':').map(Number);
  const ap: 'AM' | 'PM' = h24 >= 12 ? 'PM' : 'AM';
  const h12 = ((h24 + 11) % 12) + 1;
  const at = (H: number, M: number) => onChange(`${pad((H + 24) % 24)}:${pad((M + 60) % 60)}`);
  const setH12 = (h: number, a: 'AM' | 'PM') => { let H = h % 12; if (a === 'PM') H += 12; at(H, minute); };
  return (
    <View style={{ gap: theme.spacing(2) }}>
      <Text style={[textStyles.muted, st.timeLabel]}>Time</Text>
      <View style={st.timeControls}>
        <Stepper
          label="Hour"
          text={pad(hour12 ? h12 : h24)}
          onUp={() => at(h24 + 1, minute)}
          onDown={() => at(h24 - 1, minute)}
          onText={(n) => { if (hour12) { if (n >= 1 && n <= 12) setH12(n, ap); } else if (n >= 0 && n <= 23) at(n, minute); }}
        />
        <Text style={st.colon}>:</Text>
        <Stepper
          label="Minute"
          text={pad(minute)}
          onUp={() => at(h24, minute + 1)}
          onDown={() => at(h24, minute - 1)}
          onText={(n) => { if (n >= 0 && n <= 59) at(h24, n); }}
        />
        {hour12 && (
          <View style={st.ampm}>
            {(['AM', 'PM'] as const).map((a) => (
              <TouchableOpacity key={a} style={[st.ampmChip, ap === a && st.ampmSel]} onPress={() => setH12(h12, a)} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={a} accessibilityState={{ selected: ap === a }}>
                <Text style={[st.ampmTxt, ap === a && st.ampmTxtSel]}>{a}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
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
  zoneNote: { fontSize: theme.font.tiny },
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
