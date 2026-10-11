/** Sports run as a programme of timed / measured EVENTS on the results engine
 *  (no matches, no league / knockout format): athletics (SD-90 / 91),
 *  swimming (SD-94), weightlifting (SD-97), shooting (SD-96), archery (SD-95), rowing (SD-99), canoe sprint (SD-100) and cycling (SD-98). Their tournaments share the event setup, results, hub
 *  and career screens. PURE. */
export const EVENT_SPORTS = ['athletics', 'swimming', 'weightlifting', 'shooting', 'archery', 'rowing', 'canoe', 'cycling'] as const;
export type EventSport = (typeof EVENT_SPORTS)[number];

export const isEventSport = (s?: string | null): s is EventSport => !!s && (EVENT_SPORTS as readonly string[]).includes(s);

/** Words that differ per event sport. */
export const EVENT_WORDS: Record<EventSport, { icon: string; athlete: string; athletes: string; race: string }> = {
  athletics: { icon: '🏃', athlete: 'athlete', athletes: 'athletes', race: 'race' },
  swimming: { icon: '🏊', athlete: 'swimmer', athletes: 'swimmers', race: 'race' },
  weightlifting: { icon: '🏋️', athlete: 'lifter', athletes: 'lifters', race: 'session' },
  shooting: { icon: '🎯', athlete: 'shooter', athletes: 'shooters', race: 'match' },
  archery: { icon: '🏹', athlete: 'archer', athletes: 'archers', race: 'event' },
  rowing: { icon: '🚣', athlete: 'rower', athletes: 'rowers', race: 'race' },
  canoe: { icon: '🛶', athlete: 'paddler', athletes: 'paddlers', race: 'race' },
  cycling: { icon: '🚴', athlete: 'rider', athletes: 'riders', race: 'race' },
};
export const eventWords = (s?: string | null) => EVENT_WORDS[isEventSport(s) ? s : 'athletics'];

/** SD-97: the results-engine discipline prefix of an event sport ('ath.', 'swim.', 'wl.'). */
export const EVENT_PREFIX: Record<EventSport, string> = { athletics: 'ath.', swimming: 'swim.', weightlifting: 'wl.', shooting: 'shoot.', archery: 'arch.', rowing: 'row.', canoe: 'cs.', cycling: 'cyc.' };
export const eventPrefix = (s?: string | null) => EVENT_PREFIX[isEventSport(s) ? s : 'athletics'];
