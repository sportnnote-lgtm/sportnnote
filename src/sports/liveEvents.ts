/**
 * A sport-agnostic live timeline event. Net/raid sports (badminton, tennis,
 * volleyball, kabaddi) emit these; the generic <LiveTimeline/> renders them.
 * `stamp` is the left-column marker — a minute ("12'"), a game ("G2"), a set,
 * or "Raid" — whatever reads naturally for that sport.
 */
export interface LiveEvent {
  id: number;
  stamp: string;
  icon: string;
  label: string;
  detail?: string;
  side?: 'home' | 'away';
  /** Optional structured fields for sports that support timeline correction
   *  (remove/edit a past moment) — e.g. kabaddi. Ignored by sports that don't. */
  kind?: string; // e.g. 'raid' | 'tackle' | 'sub'
  points?: number;
  playerName?: string;
  minute?: number;
  half?: number;
}
