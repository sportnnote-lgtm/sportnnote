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
  /** SD-29: the credited player's id (volleyball points once the court six is
   *  stamped) — sets played reach the right stat line */
  playerId?: string;
  minute?: number;
  half?: number;
  set?: number; // volleyball: which set this point belongs to (per-set stats)
  game?: number; // badminton: which game this point belongs to (per-game stats)
  /** SD-21 — side-out sports: who WON a rally that scored no point (kind
   *  'rally'). `side` keeps its legacy meaning on those events. */
  wonBy?: 'home' | 'away';
  /** SD-104 — tennis: this point (won by `side`) was the opponent's double
   *  fault; the faulting server, if named. Only on points recorded with the
   *  `df` payload flag (older double faults carry no marker). */
  df?: { playerId?: string; playerName?: string };
  /** SD-107 — optional point detail (racket sports, "Point detail" on): how
   *  the point was won. Set by POINT_DETAIL; absent on every older point. */
  pd?: import('./pointDetail').PointDetail;
  /** SD-107 — tennis 1st / 2nd serve, on points served while "1st / 2nd
   *  serve" tracking was on (absent = not tracked). A double fault is 2. */
  serve?: 1 | 2;
  /** SD-117b — volleyball "Opp. fault" detail (optional): what went wrong
   *  (VB_ERROR_TYPES key) and the erring OPPONENT (charged `errors`). Only on
   *  faults logged with it. */
  oe?: { type?: string; playerId?: string; playerName?: string };
  /** SD-117b — kabaddi: how the raider was tackled (optional chip). */
  tackleType?: string;
  /** Optional outcome accent for the timeline node/label — e.g. cricket colours a
   *  boundary green, a wicket red, an extra amber. Absent → node uses the side colour. */
  tone?: 'boundary' | 'wicket' | 'extra';
}
