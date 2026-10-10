/**
 * Per-sport profile fields — the "expert knowledge" of which dominant-side
 * choices each sport actually needs, and a helpful position hint.
 *
 * A sport can need MORE THAN ONE side dimension: a cricketer can bat
 * right-handed but bowl left-arm; a tennis player has a playing hand and a
 * one/two-handed backhand. Each dimension is independent.
 */
import type { SportId } from '../core/types';

export interface SideField {
  /** stored under SportDetail.sides[key] */
  key: string;
  label: string;
  options: string[];
}

export const SPORT_SIDE_FIELDS: Record<SportId, SideField[]> = {
  // One foot. (Some players are genuinely two-footed.)
  football: [{ key: 'foot', label: 'Preferred foot', options: ['Right', 'Left', 'Both'] }],
  // Batting hand and bowling arm are separate — a right-hand bat can be a
  // left-arm bowler, and many players don't bowl at all.
  cricket: [
    { key: 'bat', label: 'Batting', options: ['Right-handed', 'Left-handed'] },
    { key: 'bowl', label: 'Bowling arm', options: ['Right-arm', 'Left-arm', "Doesn't bowl"] },
  ],
  // Shooting/dominant hand.
  basketball: [{ key: 'hand', label: 'Dominant hand', options: ['Right', 'Left', 'Both'] }],
  // Racket hand plus the backhand grip — both matter in tennis.
  tennis: [
    { key: 'hand', label: 'Playing hand', options: ['Right', 'Left'] },
    { key: 'backhand', label: 'Backhand', options: ['One-handed', 'Two-handed'] },
  ],
  // Racket hand.
  badminton: [{ key: 'hand', label: 'Playing hand', options: ['Right', 'Left'] }],
  // Spiking/hitting hand.
  volleyball: [{ key: 'hand', label: 'Hitting hand', options: ['Right', 'Left'] }],
  // Kabaddi has no handedness worth recording — the role (raider/defender) is
  // captured by the position field, so no side dimensions here.
  kabaddi: [],
  // Racquet/paddle sports — just the playing hand.
  pickleball: [{ key: 'hand', label: 'Playing hand', options: ['Right', 'Left'] }],
  padel: [{ key: 'hand', label: 'Playing hand', options: ['Right', 'Left'] }],
  squash: [{ key: 'hand', label: 'Playing hand', options: ['Right', 'Left'] }],
  tabletennis: [
    { key: 'hand', label: 'Playing hand', options: ['Right', 'Left'] },
    { key: 'grip', label: 'Grip', options: ['Shakehand', 'Penhold'] },
    { key: 'style', label: 'Style', options: ['Attacker', 'Defender', 'All-round'] },
  ],
  chess: [],
  carrom: [{ key: 'hand', label: 'Striking hand', options: ['Right', 'Left'] }],
  golf: [{ key: 'hand', label: 'Plays', options: ['Right-handed', 'Left-handed'] }],
  // Track: the event group is the "position"; no handedness.
  athletics: [],
  // Hockey sticks are one-sided — no handedness worth recording.
  hockey: [],
  swimming: [],
  weightlifting: [],
  shooting: [{ key: 'eye', label: 'Dominant eye', options: ['Right', 'Left'] }],
  // A left-hander is prized on the right side (right back / right wing).
  handball: [{ key: 'hand', label: 'Throwing hand', options: ['Right', 'Left'] }],
};

export const POSITION_HINT: Record<SportId, string> = {
  football: 'e.g. Striker, Centre-back, Goalkeeper',
  cricket: 'e.g. Opening batter, All-rounder, Wicket-keeper',
  basketball: 'e.g. Point guard, Center',
  tennis: 'e.g. Singles, Doubles',
  badminton: 'e.g. Singles, Doubles',
  volleyball: 'e.g. Setter, Libero, Outside hitter',
  kabaddi: 'e.g. Raider, Defender, All-rounder',
  pickleball: 'e.g. Singles, Doubles',
  padel: 'e.g. Doubles (left / right)',
  squash: 'e.g. Singles',
  tabletennis: 'e.g. Singles, Doubles',
  chess: 'e.g. FIDE 1650, Rapid specialist',
  carrom: 'e.g. Singles, Doubles',
  golf: 'e.g. Handicap index 12.4, Home club',
  athletics: 'e.g. Sprints (100 / 200 m), Hurdles, Middle distance',
  hockey: 'e.g. Goalkeeper, Defender, Midfielder, Forward, Drag-flicker',
  swimming: 'e.g. Sprint freestyle, Backstroke, Individual medley',
  weightlifting: 'e.g. Senior men 79 kg, Youth girls 53 kg',
  shooting: 'e.g. 10 m Air Rifle, 10 m Air Pistol, 50 m Rifle 3 Positions',
  handball: 'e.g. Goalkeeper, Left wing, Left back, Centre back, Right back, Right wing, Pivot',
};
