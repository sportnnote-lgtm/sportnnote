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
  kind?: string; // e.g. 'raid' | 'tackle' | 'sub' | 'point' | 'ace'
  points?: number;
  playerName?: string;
  minute?: number;
  half?: number;
  set?: number; // volleyball: which set this point belongs to (per-set stats)
  game?: number; // badminton: which game this point belongs to (per-game stats)
  /** Optional outcome accent for the timeline node/label — e.g. cricket colours a
   *  boundary green, a wicket red, an extra amber. Absent → node uses the side colour. */
  tone?: 'boundary' | 'wicket' | 'extra';
}
