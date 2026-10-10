/** Sports run as a programme of timed / measured EVENTS on the results engine
 *  (no matches, no league / knockout format): athletics (SD-90 / 91) and
 *  swimming (SD-94). Their tournaments share the event setup, results, hub
 *  and career screens. PURE. */
export const EVENT_SPORTS = ['athletics', 'swimming'] as const;
export type EventSport = (typeof EVENT_SPORTS)[number];

export const isEventSport = (s?: string | null): s is EventSport => !!s && (EVENT_SPORTS as readonly string[]).includes(s);

/** Words that differ per event sport. */
export const EVENT_WORDS: Record<EventSport, { icon: string; athlete: string; athletes: string; race: string }> = {
  athletics: { icon: '🏃', athlete: 'athlete', athletes: 'athletes', race: 'race' },
  swimming: { icon: '🏊', athlete: 'swimmer', athletes: 'swimmers', race: 'race' },
};
export const eventWords = (s?: string | null) => EVENT_WORDS[isEventSport(s) ? s : 'athletics'];
