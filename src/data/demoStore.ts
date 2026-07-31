/**
 * Mutable in-memory store for DEMO MODE. Seeded from the static mock data, but
 * unlike the mock it can be appended to — so tournaments/teams/matches an
 * organizer creates while offline show up immediately. When Supabase is
 * configured, none of this is used; the repos hit Postgres instead.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TOURNAMENTS, MATCHES } from '../core/mockData';
import { WC_TOURNAMENT, WC_MATCH, WC_PLAYERS, WC_LINEUP, WC_SQUADS } from './worldCupSeed';
import { BN_MATCH, BN_PLAYERS, BN_LINEUP, BN_SQUADS } from './worldCupBraNorSeed';
import { PE_MATCH, PE_PLAYERS, PE_LINEUP, PE_SQUADS } from './worldCupPorEspSeed';
import { AE_MATCH, AE_PLAYERS, AE_LINEUP, AE_SQUADS } from './worldCupArgEgySeed';
import { CRICKET_MATCH_EVENTS, CRICKET_LIVE_EVENTS, CRICKET_LIVE_SQUADS } from './cricketSeed';
import { emptyFormation } from '../sports/football/formation';
import { courtFormation } from '../sports/courts';
import type {
  FootballProfile,
  Listing,
  Match,
  MatchDispute,
  MatchEventRecord,
  Organization,
  MatchLineup,
  LineupSlot,
  MatchSquad,
  MatchSquads,
  Player,
  StatLine,
  Team,
  TeamInvite,
  TeamLeadership,
  Tournament,
} from '../core/types';

let counter = 1;
/** Deterministic local id (no Date/random needed). */
export const genId = (prefix: string) => `local-${prefix}-${counter++}`;

function deriveTeams(matches: Match[]): Team[] {
  // Real schema has one team row per sport; the mock reuses ids across sports,
  // so key by sport+shortName and mint a clean per-sport id for the pickers.
  const map = new Map<string, Team>();
  for (const m of matches) {
    for (const t of [m.homeTeam, m.awayTeam]) {
      const key = `${t.sport}:${t.shortName}`;
      if (!map.has(key)) map.set(key, { ...t, id: `${t.sport}-${t.shortName}` });
    }
  }
  return [...map.values()];
}

const RED = '#FF5C5C';
const BLUE = '#4DA3FF';
const GREEN = '#3DDC97';
const GOLD = '#FFB454';

const players: Player[] = [
  // Greenwood High (the demo tournament) — house teams.
  { id: 'p-aarav', fullName: 'Aarav Mehta', jerseyNo: 10, sports: ['football', 'cricket', 'basketball', 'badminton', 'tennis'], houseName: 'Red House', houseColor: RED, city: 'Bengaluru',
    dob: '2009-09-10', // ~16 — a minor, so a guardian is on the profile
    phone: '+91 98765 43210', email: 'aarav.mehta@email.com',
    emailVerified: true, // signed up with email; phone still needs verifying
    guardian: { name: 'Priya Mehta', phone: '+91 98765 22220', email: 'priya.mehta@email.com', phoneVerified: true },
    verification: { status: 'pending', docName: 'birth-certificate.jpg', submittedAt: Date.parse('2026-06-14'), history: [{ action: 'submitted', at: Date.parse('2026-06-14'), docName: 'birth-certificate.jpg' }] },
    photoUrl: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMjAiIGhlaWdodD0iMTIwIj48cmVjdCB3aWR0aD0iMTIwIiBoZWlnaHQ9IjEyMCIgZmlsbD0iI0ZGNUM1QyIvPjx0ZXh0IHg9IjYwIiB5PSI3NiIgZm9udC1zaXplPSI1MiIgZm9udC1mYW1pbHk9IkFyaWFsIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjZmZmIj5BTTwvdGV4dD48L3N2Zz4=',
    sportDetails: {
      football: { position: 'Striker', sides: { foot: 'Right' }, teams: [
        { name: 'Red House', jersey: 10, since: '2023-06-01' },
        { name: 'Bengaluru Strikers', jersey: 9, since: '2021-01-01', until: '2022-12-31' }, // a former club
      ] },
      // A right-handed batter who bowls left-arm — the case that needs two side fields.
      cricket: { position: 'All-rounder', sides: { bat: 'Right-handed', bowl: 'Left-arm' }, teams: [
        { name: 'Red House', jersey: 10, since: '2023-06-01' },
        { name: 'City Cricket Club', jersey: 7, since: '2024-04-01' },
      ] },
      tennis: { position: 'Singles', sides: { hand: 'Right', backhand: 'Two-handed' } },
    } },
  // A young player whose parent created & manages the profile (no own phone/email).
  { id: 'p-aanya', fullName: 'Aanya Mehta', jerseyNo: 7, sports: ['badminton', 'basketball'], houseName: 'Red House', houseColor: RED, city: 'Bengaluru',
    dob: '2015-02-20', // ~11
    guardian: { name: 'Priya Mehta', phone: '+91 98765 22220', email: 'priya.mehta@email.com', phoneVerified: true, emailVerified: true },
    verification: { status: 'approved', reviewedAt: Date.parse('2026-06-10'), reviewedByName: 'Support Team',
      history: [
        { action: 'submitted', at: Date.parse('2026-06-09'), docName: 'birth-certificate.pdf' },
        { action: 'approved', at: Date.parse('2026-06-10'), byName: 'Support Team' },
      ] } },
  { id: 'p-diya', fullName: 'Diya Rao', jerseyNo: 7, sports: ['badminton', 'volleyball', 'basketball'], houseName: 'Green House', houseColor: GREEN, city: 'Bengaluru' },
  { id: 'p-kabir', fullName: 'Kabir Singh', jerseyNo: 23, sports: ['basketball'], houseName: 'Gold House', houseColor: GOLD, city: 'Bengaluru' },
  { id: 'p-meera', fullName: 'Meera Joshi', jerseyNo: 5, sports: ['basketball', 'kabaddi'], houseName: 'Gold House', houseColor: GOLD, city: 'Bengaluru' },
  { id: 'p-ishaan', fullName: 'Ishaan Verma', jerseyNo: 4, sports: ['football', 'cricket', 'kabaddi', 'tennis'], houseName: 'Blue House', houseColor: BLUE, city: 'Bengaluru' },
  { id: 'p-ananya', fullName: 'Ananya Iyer', jerseyNo: 9, sports: ['volleyball', 'basketball'], houseName: 'Green House', houseColor: GREEN, city: 'Bengaluru' },
  { id: 'p-rohan', fullName: 'Rohan Nair', jerseyNo: 11, sports: ['football', 'cricket', 'volleyball'], houseName: 'Red House', houseColor: RED, city: 'Bengaluru' },
  // Wider community — other schools/clubs across cities (open profiles).
  { id: 'p-arjun', fullName: 'Arjun Reddy', sports: ['football', 'tennis'], houseName: 'St. Xaviers FC', houseColor: BLUE, city: 'Hyderabad' },
  { id: 'p-sara', fullName: 'Sara Khan', sports: ['badminton', 'tennis'], houseName: 'Smash Academy', houseColor: GOLD, city: 'Hyderabad' },
  { id: 'p-vivaan', fullName: 'Vivaan Gupta', sports: ['basketball'], houseName: 'Hoop City', houseColor: RED, city: 'Mumbai' },
  { id: 'p-tara', fullName: 'Tara DSouza', sports: ['volleyball', 'basketball'], houseName: 'Marine Spikers', houseColor: GREEN, city: 'Mumbai' },
  { id: 'p-zoya', fullName: 'Zoya Sheikh', sports: ['football', 'kabaddi'], houseName: 'Delhi United', houseColor: RED, city: 'Delhi' },
  { id: 'p-karthik', fullName: 'Karthik Nair', sports: ['kabaddi'], houseName: 'Raiders Club', houseColor: GOLD, city: 'Chennai' },
  { id: 'p-isha', fullName: 'Isha Patel', sports: ['tennis', 'badminton'], houseName: 'Baseline TC', houseColor: GREEN, city: 'Pune' },
  { id: 'p-dev', fullName: 'Dev Malhotra', sports: ['football', 'basketball'], houseName: 'North Stars', houseColor: BLUE, city: 'Delhi' },
  // More Greenwood house players, so house squads & leaderboards run deeper.
  { id: 'p-neil', fullName: 'Neil Kapoor', jerseyNo: 8, sports: ['football', 'cricket'], houseName: 'Red House', houseColor: RED, city: 'Bengaluru' },
  { id: 'p-sana', fullName: 'Sana Qureshi', jerseyNo: 12, sports: ['volleyball', 'basketball'], houseName: 'Red House', houseColor: RED, city: 'Bengaluru' },
  { id: 'p-maya', fullName: 'Maya Pillai', jerseyNo: 6, sports: ['football', 'volleyball'], houseName: 'Blue House', houseColor: BLUE, city: 'Bengaluru' },
  { id: 'p-veer', fullName: 'Veer Chauhan', jerseyNo: 15, sports: ['basketball', 'cricket'], houseName: 'Blue House', houseColor: BLUE, city: 'Bengaluru' },
  { id: 'p-arnav', fullName: 'Arnav Desai', jerseyNo: 14, sports: ['football', 'kabaddi'], houseName: 'Green House', houseColor: GREEN, city: 'Bengaluru' },
  { id: 'p-anika', fullName: 'Anika Bose', jerseyNo: 3, sports: ['tennis', 'badminton'], houseName: 'Green House', houseColor: GREEN, city: 'Bengaluru' },
  { id: 'p-rehan', fullName: 'Rehan Ali', jerseyNo: 21, sports: ['football', 'volleyball'], houseName: 'Gold House', houseColor: GOLD, city: 'Bengaluru' },
  { id: 'p-tanvi', fullName: 'Tanvi Shetty', jerseyNo: 17, sports: ['basketball', 'badminton'], houseName: 'Gold House', houseColor: GOLD, city: 'Bengaluru' },
  // More community players across cities & sports for richer discovery/leaders.
  { id: 'p-laila', fullName: 'Laila Menon', sports: ['badminton', 'tennis'], houseName: 'Smash Academy', houseColor: GOLD, city: 'Hyderabad' },
  { id: 'p-omar', fullName: 'Omar Farooq', sports: ['basketball'], houseName: 'Hoop City', houseColor: RED, city: 'Mumbai' },
  { id: 'p-ria', fullName: 'Ria Kulkarni', sports: ['football', 'volleyball'], houseName: 'Coastal Strikers', houseColor: GREEN, city: 'Chennai' },
  { id: 'p-jay', fullName: 'Jay Thomas', sports: ['kabaddi', 'cricket'], houseName: 'Raiders Club', houseColor: BLUE, city: 'Chennai' },
  // Full cricket squads for the live match (Red House vs Blue House) so there's
  // a complete batting & bowling lineup to score with. (8-a-side per the format.)
  { id: 'p-vikram', fullName: 'Vikram Rao', jerseyNo: 1, sports: ['cricket'], houseName: 'Red House', houseColor: RED, city: 'Bengaluru' },
  { id: 'p-suresh', fullName: 'Suresh Pillai', jerseyNo: 2, sports: ['cricket'], houseName: 'Red House', houseColor: RED, city: 'Bengaluru' },
  { id: 'p-manoj', fullName: 'Manoj Kumar', jerseyNo: 16, sports: ['cricket'], houseName: 'Red House', houseColor: RED, city: 'Bengaluru' },
  { id: 'p-deepak', fullName: 'Deepak Shetty', jerseyNo: 18, sports: ['cricket'], houseName: 'Red House', houseColor: RED, city: 'Bengaluru' },
  { id: 'p-farhan', fullName: 'Farhan Khan', jerseyNo: 99, sports: ['cricket'], houseName: 'Red House', houseColor: RED, city: 'Bengaluru' },
  { id: 'p-sanjay', fullName: 'Sanjay Menon', jerseyNo: 1, sports: ['cricket'], houseName: 'Blue House', houseColor: BLUE, city: 'Bengaluru' },
  { id: 'p-rahul', fullName: 'Rahul Dev', jerseyNo: 2, sports: ['cricket'], houseName: 'Blue House', houseColor: BLUE, city: 'Bengaluru' },
  { id: 'p-imran', fullName: 'Imran Sheikh', jerseyNo: 16, sports: ['cricket'], houseName: 'Blue House', houseColor: BLUE, city: 'Bengaluru' },
  { id: 'p-gaurav', fullName: 'Gaurav Joshi', jerseyNo: 18, sports: ['cricket'], houseName: 'Blue House', houseColor: BLUE, city: 'Bengaluru' },
  { id: 'p-naveen', fullName: 'Naveen Reddy', jerseyNo: 7, sports: ['cricket'], houseName: 'Blue House', houseColor: BLUE, city: 'Bengaluru' },
  { id: 'p-tarun', fullName: 'Tarun Bhat', jerseyNo: 8, sports: ['cricket'], houseName: 'Blue House', houseColor: BLUE, city: 'Bengaluru' },
  // Three more Blue House cricketers so the cricket seeds field a full 8 of eligible
  // players (Gaurav/Tarun are intentionally unverified, Naveen is pending review).
  { id: 'p-bh-c1', fullName: 'Karan Bose', jerseyNo: 3, sports: ['cricket'], houseName: 'Blue House', houseColor: BLUE, city: 'Bengaluru' },
  { id: 'p-bh-c2', fullName: 'Ajay Kamath', jerseyNo: 5, sports: ['cricket'], houseName: 'Blue House', houseColor: BLUE, city: 'Bengaluru' },
  { id: 'p-bh-c3', fullName: 'Vivek Anand', jerseyNo: 9, sports: ['cricket'], houseName: 'Blue House', houseColor: BLUE, city: 'Bengaluru' },

  // ---- Squad depth: full multi-sport squads for every Greenwood house, so each
  // house fields a real team in every sport — enough for substitutions, impact
  // players, foul-outs and deciding sets to be demonstrable across the board. ----
  // Red House depth
  { id: 'p-rh-1', fullName: 'Kiran Rao', jerseyNo: 20, sports: ['kabaddi', 'volleyball', 'football'], houseName: 'Red House', houseColor: RED, city: 'Bengaluru' },
  { id: 'p-rh-2', fullName: 'Aditya Pai', jerseyNo: 21, sports: ['kabaddi', 'basketball', 'volleyball'], houseName: 'Red House', houseColor: RED, city: 'Bengaluru' },
  { id: 'p-rh-3', fullName: 'Nikhil Shetty', jerseyNo: 22, sports: ['kabaddi', 'football', 'cricket'], houseName: 'Red House', houseColor: RED, city: 'Bengaluru' },
  { id: 'p-rh-4', fullName: 'Pooja Hegde', jerseyNo: 24, sports: ['volleyball', 'basketball', 'badminton'], houseName: 'Red House', houseColor: RED, city: 'Bengaluru' },
  { id: 'p-rh-5', fullName: 'Sneha Rao', jerseyNo: 25, sports: ['badminton', 'tennis', 'volleyball'], houseName: 'Red House', houseColor: RED, city: 'Bengaluru' },
  { id: 'p-rh-6', fullName: 'Varun Kamath', jerseyNo: 26, sports: ['kabaddi', 'football', 'tennis'], houseName: 'Red House', houseColor: RED, city: 'Bengaluru' },
  { id: 'p-rh-7', fullName: 'Rakesh Gowda', jerseyNo: 27, sports: ['kabaddi', 'volleyball', 'basketball', 'football'], houseName: 'Red House', houseColor: RED, city: 'Bengaluru' },
  { id: 'p-rh-8', fullName: 'Divya Menon', jerseyNo: 28, sports: ['tennis', 'badminton', 'basketball'], houseName: 'Red House', houseColor: RED, city: 'Bengaluru' },
  { id: 'p-rh-9', fullName: 'Harsha Bhat', jerseyNo: 29, sports: ['football', 'volleyball', 'kabaddi'], houseName: 'Red House', houseColor: RED, city: 'Bengaluru' },
  // Blue House depth
  { id: 'p-bh-1', fullName: 'Faisal Khan', jerseyNo: 20, sports: ['kabaddi', 'football', 'volleyball'], houseName: 'Blue House', houseColor: BLUE, city: 'Bengaluru' },
  { id: 'p-bh-2', fullName: 'Rohit Pillai', jerseyNo: 21, sports: ['kabaddi', 'basketball', 'volleyball', 'football'], houseName: 'Blue House', houseColor: BLUE, city: 'Bengaluru' },
  { id: 'p-bh-3', fullName: 'Sameer Das', jerseyNo: 22, sports: ['kabaddi', 'football', 'tennis'], houseName: 'Blue House', houseColor: BLUE, city: 'Bengaluru' },
  { id: 'p-bh-4', fullName: 'Nisha Rao', jerseyNo: 24, sports: ['volleyball', 'basketball', 'badminton'], houseName: 'Blue House', houseColor: BLUE, city: 'Bengaluru' },
  { id: 'p-bh-5', fullName: 'Aisha Begum', jerseyNo: 25, sports: ['badminton', 'tennis', 'volleyball'], houseName: 'Blue House', houseColor: BLUE, city: 'Bengaluru' },
  { id: 'p-bh-6', fullName: 'Karan Mehta', jerseyNo: 26, sports: ['kabaddi', 'basketball', 'football'], houseName: 'Blue House', houseColor: BLUE, city: 'Bengaluru' },
  { id: 'p-bh-7', fullName: 'Vivek Shenoy', jerseyNo: 27, sports: ['kabaddi', 'volleyball', 'tennis', 'football'], houseName: 'Blue House', houseColor: BLUE, city: 'Bengaluru' },
  { id: 'p-bh-8', fullName: 'Tina Dsa', jerseyNo: 28, sports: ['tennis', 'badminton', 'basketball'], houseName: 'Blue House', houseColor: BLUE, city: 'Bengaluru' },
  { id: 'p-bh-9', fullName: 'Aman Joshi', jerseyNo: 29, sports: ['football', 'volleyball', 'badminton'], houseName: 'Blue House', houseColor: BLUE, city: 'Bengaluru' },
  // Organizer-invited prospect who hasn't registered yet — shows in the team's
  // "invited · pending" list on the add-player card until they install & sign up.
  { id: 'p-bh-inv', fullName: 'Rehan Malik', sports: ['football'], houseName: 'Blue House', houseColor: BLUE, city: 'Bengaluru', invited: true, phone: '+91 90000 12345' },
  // Green House depth (incl. a full cricket squad — the house had none)
  { id: 'p-gh-1', fullName: 'Rahul Gupta', jerseyNo: 20, sports: ['cricket', 'football', 'kabaddi'], houseName: 'Green House', houseColor: GREEN, city: 'Bengaluru' },
  { id: 'p-gh-2', fullName: 'Vikas Shetty', jerseyNo: 21, sports: ['cricket', 'kabaddi'], houseName: 'Green House', houseColor: GREEN, city: 'Bengaluru' },
  { id: 'p-gh-3', fullName: 'Sandeep Rao', jerseyNo: 22, sports: ['cricket', 'volleyball', 'football'], houseName: 'Green House', houseColor: GREEN, city: 'Bengaluru' },
  { id: 'p-gh-4', fullName: 'Manish Kumar', jerseyNo: 24, sports: ['cricket', 'basketball'], houseName: 'Green House', houseColor: GREEN, city: 'Bengaluru' },
  { id: 'p-gh-5', fullName: 'Prakash Hegde', jerseyNo: 25, sports: ['cricket', 'football'], houseName: 'Green House', houseColor: GREEN, city: 'Bengaluru' },
  { id: 'p-gh-6', fullName: 'Girish Naik', jerseyNo: 26, sports: ['cricket', 'kabaddi', 'volleyball'], houseName: 'Green House', houseColor: GREEN, city: 'Bengaluru' },
  { id: 'p-gh-7', fullName: 'Suhas Pai', jerseyNo: 27, sports: ['cricket', 'tennis'], houseName: 'Green House', houseColor: GREEN, city: 'Bengaluru' },
  { id: 'p-gh-8', fullName: 'Lokesh Gowda', jerseyNo: 28, sports: ['cricket', 'football', 'kabaddi'], houseName: 'Green House', houseColor: GREEN, city: 'Bengaluru' },
  { id: 'p-gh-9', fullName: 'Bhavana Rao', jerseyNo: 29, sports: ['volleyball', 'basketball', 'badminton', 'kabaddi'], houseName: 'Green House', houseColor: GREEN, city: 'Bengaluru' },
  { id: 'p-gh-10', fullName: 'Megha Iyer', jerseyNo: 30, sports: ['tennis', 'badminton', 'volleyball', 'basketball'], houseName: 'Green House', houseColor: GREEN, city: 'Bengaluru' },
  // Gold House depth (incl. a full cricket squad — the house had none)
  { id: 'p-yh-1', fullName: 'Imran Pasha', jerseyNo: 20, sports: ['cricket', 'football', 'kabaddi'], houseName: 'Gold House', houseColor: GOLD, city: 'Bengaluru' },
  { id: 'p-yh-2', fullName: 'Naveen Shetty', jerseyNo: 21, sports: ['cricket', 'kabaddi'], houseName: 'Gold House', houseColor: GOLD, city: 'Bengaluru' },
  { id: 'p-yh-3', fullName: 'Ravi Teja', jerseyNo: 22, sports: ['cricket', 'volleyball', 'football'], houseName: 'Gold House', houseColor: GOLD, city: 'Bengaluru' },
  { id: 'p-yh-4', fullName: 'Sunil Rao', jerseyNo: 24, sports: ['cricket', 'basketball'], houseName: 'Gold House', houseColor: GOLD, city: 'Bengaluru' },
  { id: 'p-yh-5', fullName: 'Ganesh Hegde', jerseyNo: 25, sports: ['cricket', 'football'], houseName: 'Gold House', houseColor: GOLD, city: 'Bengaluru' },
  { id: 'p-yh-6', fullName: 'Mahesh Naik', jerseyNo: 26, sports: ['cricket', 'kabaddi', 'volleyball'], houseName: 'Gold House', houseColor: GOLD, city: 'Bengaluru' },
  { id: 'p-yh-7', fullName: 'Deepa Shetty', jerseyNo: 27, sports: ['cricket', 'tennis', 'badminton'], houseName: 'Gold House', houseColor: GOLD, city: 'Bengaluru' },
  { id: 'p-yh-8', fullName: 'Kiran Joshi', jerseyNo: 28, sports: ['cricket', 'football', 'kabaddi', 'tennis'], houseName: 'Gold House', houseColor: GOLD, city: 'Bengaluru' },
  { id: 'p-yh-9', fullName: 'Asha Rao', jerseyNo: 29, sports: ['volleyball', 'basketball', 'badminton', 'kabaddi'], houseName: 'Gold House', houseColor: GOLD, city: 'Bengaluru' },
  { id: 'p-yh-10', fullName: 'Ritu Singh', jerseyNo: 30, sports: ['tennis', 'badminton', 'volleyball', 'basketball'], houseName: 'Gold House', houseColor: GOLD, city: 'Bengaluru' },

  // Bengaluru Premier League (t2) club footballers — rostered to the BPL clubs
  // so the league's leaders only feature players from its participating teams.
  { id: 'p-bpl-rahul', fullName: 'Rahul Menon', jerseyNo: 9, sports: ['football'], houseName: 'Falcons FC', houseColor: '#E0457B', city: 'Bengaluru' },
  { id: 'p-bpl-aditya', fullName: 'Aditya Shetty', jerseyNo: 11, sports: ['football'], houseName: 'Falcons FC', houseColor: '#E0457B', city: 'Bengaluru' },
  { id: 'p-bpl-sameer', fullName: 'Sameer Khan', jerseyNo: 7, sports: ['football'], houseName: 'City Strikers', houseColor: '#2D9CDB', city: 'Bengaluru' },
  { id: 'p-bpl-joel', fullName: 'Joel Mathew', jerseyNo: 10, sports: ['football'], houseName: 'Rovers United', houseColor: '#27AE60', city: 'Bengaluru' },
  { id: 'p-bpl-vikas', fullName: 'Vikas Rao', jerseyNo: 8, sports: ['football'], houseName: 'Titan Athletic', houseColor: '#8E6FE0', city: 'Bengaluru' },
  // Extra depth for the knockout-cup clubs (t7) so each fields a fuller squad.
  { id: 'p-fal-3', fullName: 'Dinesh Kamath', jerseyNo: 4, sports: ['football'], houseName: 'Falcons FC', houseColor: '#E0457B', city: 'Bengaluru' },
  { id: 'p-str-2', fullName: 'Bharat Singh', jerseyNo: 4, sports: ['football'], houseName: 'City Strikers', houseColor: '#2D9CDB', city: 'Bengaluru' },
  // Full starting XIs for the live cup final (kc3) so the live scorer's pickers,
  // box score and lineup read like a real 11-a-side match.
  { id: 'p-fal-4', fullName: 'Ravi Kulkarni', jerseyNo: 1, sports: ['football'], houseName: 'Falcons FC', houseColor: '#E0457B', city: 'Bengaluru' },
  { id: 'p-fal-5', fullName: 'Sunil Prabhu', jerseyNo: 2, sports: ['football'], houseName: 'Falcons FC', houseColor: '#E0457B', city: 'Bengaluru' },
  { id: 'p-fal-6', fullName: 'Anand Bhat', jerseyNo: 3, sports: ['football'], houseName: 'Falcons FC', houseColor: '#E0457B', city: 'Bengaluru' },
  { id: 'p-fal-7', fullName: 'Girish Naik', jerseyNo: 5, sports: ['football'], houseName: 'Falcons FC', houseColor: '#E0457B', city: 'Bengaluru' },
  { id: 'p-fal-8', fullName: 'Prakash Rao', jerseyNo: 6, sports: ['football'], houseName: 'Falcons FC', houseColor: '#E0457B', city: 'Bengaluru' },
  { id: 'p-fal-9', fullName: 'Vinod Shetty', jerseyNo: 8, sports: ['football'], houseName: 'Falcons FC', houseColor: '#E0457B', city: 'Bengaluru' },
  { id: 'p-fal-10', fullName: 'Harish Gowda', jerseyNo: 10, sports: ['football'], houseName: 'Falcons FC', houseColor: '#E0457B', city: 'Bengaluru' },
  { id: 'p-fal-11', fullName: 'Sudhir Rai', jerseyNo: 7, sports: ['football'], houseName: 'Falcons FC', houseColor: '#E0457B', city: 'Bengaluru' },
  { id: 'p-str-3', fullName: 'Mahesh Iyer', jerseyNo: 1, sports: ['football'], houseName: 'City Strikers', houseColor: '#2D9CDB', city: 'Bengaluru' },
  { id: 'p-str-4', fullName: 'Ganesh Rao', jerseyNo: 2, sports: ['football'], houseName: 'City Strikers', houseColor: '#2D9CDB', city: 'Bengaluru' },
  { id: 'p-str-5', fullName: 'Ashok Menon', jerseyNo: 3, sports: ['football'], houseName: 'City Strikers', houseColor: '#2D9CDB', city: 'Bengaluru' },
  { id: 'p-str-6', fullName: 'Ramesh Shetty', jerseyNo: 5, sports: ['football'], houseName: 'City Strikers', houseColor: '#2D9CDB', city: 'Bengaluru' },
  { id: 'p-str-7', fullName: 'Vijay Kamath', jerseyNo: 6, sports: ['football'], houseName: 'City Strikers', houseColor: '#2D9CDB', city: 'Bengaluru' },
  { id: 'p-str-8', fullName: 'Karthik Nair', jerseyNo: 8, sports: ['football'], houseName: 'City Strikers', houseColor: '#2D9CDB', city: 'Bengaluru' },
  { id: 'p-str-9', fullName: 'Prasad Gowda', jerseyNo: 10, sports: ['football'], houseName: 'City Strikers', houseColor: '#2D9CDB', city: 'Bengaluru' },
  { id: 'p-str-10', fullName: 'Sachin Bhat', jerseyNo: 9, sports: ['football'], houseName: 'City Strikers', houseColor: '#2D9CDB', city: 'Bengaluru' },
  { id: 'p-str-11', fullName: 'Faisal Rahman', jerseyNo: 11, sports: ['football'], houseName: 'City Strikers', houseColor: '#2D9CDB', city: 'Bengaluru' },
  // A few named substitutes each so the cup final's bench isn't empty.
  { id: 'p-fal-12', fullName: 'Deepak Shenoy', jerseyNo: 12, sports: ['football'], houseName: 'Falcons FC', houseColor: '#E0457B', city: 'Bengaluru' },
  { id: 'p-fal-13', fullName: 'Manoj Verma', jerseyNo: 13, sports: ['football'], houseName: 'Falcons FC', houseColor: '#E0457B', city: 'Bengaluru' },
  { id: 'p-fal-14', fullName: 'Sridhar Hegde', jerseyNo: 14, sports: ['football'], houseName: 'Falcons FC', houseColor: '#E0457B', city: 'Bengaluru' },
  { id: 'p-str-12', fullName: 'Nikhil Reddy', jerseyNo: 12, sports: ['football'], houseName: 'City Strikers', houseColor: '#2D9CDB', city: 'Bengaluru' },
  { id: 'p-str-13', fullName: 'Arjun Bhat', jerseyNo: 13, sports: ['football'], houseName: 'City Strikers', houseColor: '#2D9CDB', city: 'Bengaluru' },
  { id: 'p-str-14', fullName: 'Rohan Pai', jerseyNo: 14, sports: ['football'], houseName: 'City Strikers', houseColor: '#2D9CDB', city: 'Bengaluru' },
  { id: 'p-tit-2', fullName: 'Arjun Pillai', jerseyNo: 4, sports: ['football'], houseName: 'Titan Athletic', houseColor: '#8E6FE0', city: 'Bengaluru' },
  { id: 'p-rov-2', fullName: 'Kunal Das', jerseyNo: 4, sports: ['football'], houseName: 'Rovers United', houseColor: '#27AE60', city: 'Bengaluru' },

  // ---- Bengaluru City Games (t6) — four multi-sport city clubs (football,
  // basketball, volleyball) so a non-house, cross-club league has real squads. ----
  { id: 'p-ind-1', fullName: 'Tej Anand', jerseyNo: 7, sports: ['football', 'basketball'], houseName: 'Indiranagar United', houseColor: '#F2994A', city: 'Bengaluru' },
  { id: 'p-ind-2', fullName: 'Rohan Bhatt', jerseyNo: 8, sports: ['football', 'basketball', 'volleyball'], houseName: 'Indiranagar United', houseColor: '#F2994A', city: 'Bengaluru' },
  { id: 'p-ind-3', fullName: 'Sahil Verma', jerseyNo: 9, sports: ['basketball', 'volleyball'], houseName: 'Indiranagar United', houseColor: '#F2994A', city: 'Bengaluru' },
  { id: 'p-ind-4', fullName: 'Nidhi Rao', jerseyNo: 10, sports: ['volleyball', 'basketball'], houseName: 'Indiranagar United', houseColor: '#F2994A', city: 'Bengaluru' },
  { id: 'p-ind-5', fullName: 'Akash Pillai', jerseyNo: 11, sports: ['football', 'basketball', 'volleyball'], houseName: 'Indiranagar United', houseColor: '#F2994A', city: 'Bengaluru' },
  { id: 'p-kor-1', fullName: 'Vinay Kumar', jerseyNo: 7, sports: ['football', 'basketball'], houseName: 'Koramangala Kings', houseColor: '#2F80ED', city: 'Bengaluru' },
  { id: 'p-kor-2', fullName: 'Deepak Nair', jerseyNo: 8, sports: ['football', 'basketball', 'volleyball'], houseName: 'Koramangala Kings', houseColor: '#2F80ED', city: 'Bengaluru' },
  { id: 'p-kor-3', fullName: 'Manoj Pai', jerseyNo: 9, sports: ['basketball', 'volleyball'], houseName: 'Koramangala Kings', houseColor: '#2F80ED', city: 'Bengaluru' },
  { id: 'p-kor-4', fullName: 'Priya Shet', jerseyNo: 10, sports: ['volleyball', 'basketball'], houseName: 'Koramangala Kings', houseColor: '#2F80ED', city: 'Bengaluru' },
  { id: 'p-kor-5', fullName: 'Rohit Gowda', jerseyNo: 11, sports: ['football', 'basketball', 'volleyball'], houseName: 'Koramangala Kings', houseColor: '#2F80ED', city: 'Bengaluru' },
  { id: 'p-whf-1', fullName: 'Sandeep Iyer', jerseyNo: 7, sports: ['football', 'basketball'], houseName: 'Whitefield Warriors', houseColor: '#9B51E0', city: 'Bengaluru' },
  { id: 'p-whf-2', fullName: 'Arun Das', jerseyNo: 8, sports: ['football', 'volleyball'], houseName: 'Whitefield Warriors', houseColor: '#9B51E0', city: 'Bengaluru' },
  { id: 'p-whf-3', fullName: 'Kevin Thomas', jerseyNo: 9, sports: ['basketball', 'volleyball'], houseName: 'Whitefield Warriors', houseColor: '#9B51E0', city: 'Bengaluru' },
  { id: 'p-whf-4', fullName: 'Sneha Pillai', jerseyNo: 10, sports: ['volleyball', 'basketball'], houseName: 'Whitefield Warriors', houseColor: '#9B51E0', city: 'Bengaluru' },
  { id: 'p-whf-5', fullName: 'Gautam Rao', jerseyNo: 11, sports: ['football', 'basketball', 'volleyball'], houseName: 'Whitefield Warriors', houseColor: '#9B51E0', city: 'Bengaluru' },
  { id: 'p-jay-1', fullName: 'Naveen Kumar', jerseyNo: 7, sports: ['football', 'basketball'], houseName: 'Jayanagar Giants', houseColor: '#219653', city: 'Bengaluru' },
  { id: 'p-jay-2', fullName: 'Suraj Hegde', jerseyNo: 8, sports: ['football', 'volleyball'], houseName: 'Jayanagar Giants', houseColor: '#219653', city: 'Bengaluru' },
  { id: 'p-jay-3', fullName: 'Imran Ali', jerseyNo: 9, sports: ['basketball', 'volleyball'], houseName: 'Jayanagar Giants', houseColor: '#219653', city: 'Bengaluru' },
  { id: 'p-jay-4', fullName: 'Pooja Nair', jerseyNo: 10, sports: ['volleyball', 'basketball'], houseName: 'Jayanagar Giants', houseColor: '#219653', city: 'Bengaluru' },
  { id: 'p-jay-5', fullName: 'Vishal Rao', jerseyNo: 11, sports: ['football', 'basketball', 'volleyball'], houseName: 'Jayanagar Giants', houseColor: '#219653', city: 'Bengaluru' },

  // ---- Wider community across cities — richer Discover & cross-city play. ----
  { id: 'p-c-1', fullName: 'Aryan Khanna', sports: ['cricket', 'football'], houseName: 'Mumbai Mavericks', houseColor: '#EB5757', city: 'Mumbai' },
  { id: 'p-c-2', fullName: 'Riya Sharma', sports: ['badminton', 'tennis'], houseName: 'Pune Smashers', houseColor: '#F2994A', city: 'Pune' },
  { id: 'p-c-3', fullName: 'Sahil Kapoor', sports: ['basketball'], houseName: 'Delhi Dunkers', houseColor: '#2D9CDB', city: 'Delhi' },
  { id: 'p-c-4', fullName: 'Neha Reddy', sports: ['volleyball', 'basketball'], houseName: 'Hyderabad Heat', houseColor: '#BB6BD9', city: 'Hyderabad' },
  { id: 'p-c-5', fullName: 'Karan Bose', sports: ['kabaddi', 'football'], houseName: 'Chennai Chargers', houseColor: '#27AE60', city: 'Chennai' },
  { id: 'p-c-6', fullName: 'Ananya Das', sports: ['tennis', 'badminton'], houseName: 'Kolkata Racquets', houseColor: '#F2C94C', city: 'Kolkata' },
  { id: 'p-c-7', fullName: 'Yusuf Khan', sports: ['cricket'], houseName: 'Mumbai Mavericks', houseColor: '#EB5757', city: 'Mumbai' },
  { id: 'p-c-8', fullName: 'Pooja Singh', sports: ['kabaddi'], houseName: 'Chennai Chargers', houseColor: '#27AE60', city: 'Chennai' },
];

// --- Verification defaults (match-eligibility demo) -------------------------
// Most players are verified adults so they can be picked for matches. A few are
// intentionally left unverified, and one minor is pending review, so the
// match-eligibility gate and the support console both have something to show.
// (Aarav & Aanya keep their hand-authored guardian/verification above.)
const VERIFY_BLOCKED = new Set(['p-farhan', 'p-tarun', 'p-gaurav']); // unverified → blocked from matches
const PENDING_REVIEW_ID = 'p-naveen'; // a minor with a verified guardian, ID document pending
for (const p of players) {
  if (p.id === PENDING_REVIEW_ID) {
    p.dob = '2010-05-12';
    p.guardian = { name: 'Suresh Reddy', phone: '+91 90000 54321', email: 'suresh.reddy@email.com', phoneVerified: true, emailVerified: true };
    p.verification = {
      status: 'pending', docName: 'school-id.pdf', submittedAt: Date.parse('2026-06-15'),
      history: [
        { action: 'submitted', at: Date.parse('2026-06-12'), docName: 'id-photo.jpg' },
        { action: 'rejected', at: Date.parse('2026-06-13'), byName: 'Support Team', note: 'Date of birth not clearly legible' },
        { action: 'submitted', at: Date.parse('2026-06-15'), docName: 'school-id.pdf' },
      ],
    };
    continue;
  }
  if (VERIFY_BLOCKED.has(p.id)) { if (!p.dob) p.dob = '2004-08-01'; continue; } // adult, but contacts unverified → blocked
  if (p.guardian) continue; // hand-authored minors keep their own verified guardian
  if (!p.dob) p.dob = '2005-06-15'; // an adult
  p.phoneVerified = true;
  p.emailVerified = true;
  if (!p.phone) p.phone = '+91 90000 00000';
  if (!p.email) p.email = `${p.id.replace('p-', '')}@email.com`;
}

let sl = 0;
const line = (
  playerId: string,
  sport: StatLine['sport'],
  stats: Record<string, number>,
  won: boolean,
  opponent: string,
  date: string,
  matchId?: string, // link to a real match so the history row opens its full page
  tracked?: string[] // which stats this match was capturing (for per-stat game coverage)
): StatLine => ({ id: `sl-${sl++}`, matchId: matchId ?? `seed-${sl}`, playerId, sport, stats, won, opponent, date, tracked });

// Football tracking presets for seeded coverage demos.
const FB_CORE = ['goals', 'assists', 'yellowCards', 'redCards', 'cleanSheets'];
const FB_FULL = [...FB_CORE, 'shots', 'shotsOnTarget', 'fouls', 'tackles', 'interceptions', 'saves', 'passes', 'passesComplete'];
const FB_NO_PASSES = [...FB_CORE, 'shots', 'shotsOnTarget', 'fouls', 'tackles', 'interceptions', 'saves'];
// England vs Croatia tracks the goal-type split + shots.
const WC_TRACK = ['goals', 'openPlayGoals', 'penaltyGoals', 'freekickGoals', 'assists', 'yellowCards', 'redCards', 'cleanSheets', 'shots', 'shotsOnTarget'];

const statLines: StatLine[] = [
  line('p-aarav', 'football', { goals: 2, assists: 1, shots: 5, shotsOnTarget: 3, tackles: 1, passes: 41, passesComplete: 35 }, true, 'Blue House', '2026-06-15', 'f1', FB_FULL),
  line('p-aarav', 'football', { goals: 1, assists: 0 }, false, 'Green House', '2026-06-12', 'f3', FB_CORE),
  line('p-aarav', 'basketball', { points: 14, rebounds: 5 }, true, 'Gold House', '2026-06-12'),
  line('p-aarav', 'badminton', { points: 42, games: 2 }, true, 'Green House', '2026-06-10'),
  line('p-diya', 'badminton', { points: 63, games: 4 }, true, 'Red House', '2026-06-11'),
  line('p-diya', 'volleyball', { points: 18, aces: 4 }, true, 'Red House', '2026-06-14'),
  line('p-kabir', 'basketball', { points: 22, rebounds: 8 }, true, 'Green House', '2026-06-13'),
  line('p-kabir', 'basketball', { points: 14, rebounds: 6 }, false, 'Red House', '2026-06-09'),
  line('p-ishaan', 'football', { goals: 1, assists: 2 }, false, 'Red House', '2026-06-15'),
  line('p-ishaan', 'kabaddi', { raidPoints: 9, tacklePoints: 3 }, true, 'Gold House', '2026-06-16'),
  line('p-ananya', 'volleyball', { points: 21, aces: 6 }, true, 'Red House', '2026-06-14'),
  line('p-aarav', 'cricket', { runs: 54, wickets: 0 }, true, 'Blue House', '2026-06-09'),
  line('p-ishaan', 'cricket', { runs: 22, wickets: 3 }, false, 'Red House', '2026-06-09'),
  line('p-rohan', 'football', { goals: 3, assists: 0 }, true, 'Gold House', '2026-06-13'),
  // Community players' history (other tournaments/cities).
  line('p-arjun', 'football', { goals: 4, assists: 2 }, true, 'City Cup', '2026-05-30'),
  line('p-arjun', 'tennis', { points: 58, aces: 7 }, true, 'Open Round 1', '2026-05-22'),
  line('p-sara', 'badminton', { points: 71, games: 4 }, true, 'State Meet', '2026-05-18'),
  line('p-vivaan', 'basketball', { points: 31, rebounds: 9 }, true, 'League W3', '2026-06-02'),
  line('p-zoya', 'football', { goals: 5, assists: 3 }, true, 'Delhi League', '2026-06-05'),
  line('p-zoya', 'kabaddi', { raidPoints: 12, tacklePoints: 4 }, false, 'Delhi League', '2026-06-08'),
  line('p-karthik', 'kabaddi', { raidPoints: 15, tacklePoints: 6 }, true, 'South Zone', '2026-05-28'),
  line('p-isha', 'tennis', { points: 49, aces: 5 }, false, 'Open Round 2', '2026-05-25'),
  line('p-tara', 'volleyball', { points: 24, aces: 8 }, true, 'Beach Series', '2026-06-01'),
  // Football depth so the leaderboards have assists & clean sheets to rank.
  line('p-rohan', 'football', { assists: 2, cleanSheets: 1 }, true, 'Gold House', '2026-06-13'),
  line('p-ishaan', 'football', { cleanSheets: 2, assists: 1 }, true, 'Green House', '2026-06-11'),
  line('p-zoya', 'football', { cleanSheets: 1, assists: 1 }, true, 'Delhi League', '2026-06-05'),
  line('p-dev', 'football', { goals: 2, assists: 3 }, true, 'North Derby', '2026-06-03'),
  line('p-aarav', 'basketball', { assists: 7, points: 0 }, true, 'Gold House', '2026-06-12'),

  // England vs Croatia (live, m-eng-cro) — first-half goals as per-player lines so
  // profiles/leaderboards/Summary show them and live 2nd-half taps build on them.
  // Kane: penalty + headed goal; Rice assist; Baturina & Musa one each.
  line('p-eng-11', 'football', { goals: 2, openPlayGoals: 1, penaltyGoals: 1, shots: 3, shotsOnTarget: 2 }, false, 'Croatia', '2026-06-17', 'm-eng-cro', WC_TRACK), // Kane: pen 12', header 42'
  line('p-eng-9', 'football', { goals: 1, openPlayGoals: 1, shots: 2, shotsOnTarget: 2 }, false, 'Croatia', '2026-06-17', 'm-eng-cro', WC_TRACK), // Bellingham 47'
  line('p-eng-6', 'football', { assists: 1, yellowCards: 1 }, false, 'Croatia', '2026-06-17', 'm-eng-cro', WC_TRACK), // Rice assist on Kane; booked 70'
  line('p-eng-10', 'football', { shots: 1, shotsOnTarget: 1 }, false, 'Croatia', '2026-06-17', 'm-eng-cro', WC_TRACK), // Madueke (starter)
  line('p-eng-8', 'football', { shots: 1 }, false, 'Croatia', '2026-06-17', 'm-eng-cro', WC_TRACK), // Gordon
  line('p-cro-9', 'football', { goals: 1, openPlayGoals: 1, shots: 2, shotsOnTarget: 2 }, false, 'England', '2026-06-17', 'm-eng-cro', WC_TRACK), // Baturina 36'
  line('p-cro-11', 'football', { goals: 1, openPlayGoals: 1, shots: 2, shotsOnTarget: 2 }, false, 'England', '2026-06-17', 'm-eng-cro', WC_TRACK), // Musa 45'
  line('p-cro-5', 'football', { assists: 1, shots: 1 }, false, 'England', '2026-06-17', 'm-eng-cro', WC_TRACK), // Perišić assist on Musa
  line('p-cro-6', 'football', { shots: 1, shotsOnTarget: 1, yellowCards: 1 }, false, 'England', '2026-06-17', 'm-eng-cro', WC_TRACK), // Modrić; booked 55'
  line('p-cro-10', 'football', { shots: 1 }, false, 'England', '2026-06-17', 'm-eng-cro', WC_TRACK), // Mario Pašalić (starter)
  line('p-cro-2', 'football', { yellowCards: 1 }, false, 'England', '2026-06-17', 'm-eng-cro', WC_TRACK), // Gvardiol booked 76'

  // Red vs Blue (live, m1) — 1st-half events as per-player lines so the live
  // match's Summary shows player ratings (mirrors the seeded event log above).
  // Passes aren't tracked for this match (FB_NO_PASSES), matching its Stats tab.
  line('p-aarav', 'football', { goals: 1, shots: 2, shotsOnTarget: 2 }, true, 'Blue House', '2026-06-17', 'm1', FB_NO_PASSES), // 12'
  line('p-rohan', 'football', { goals: 1, shots: 2, shotsOnTarget: 1, yellowCards: 1 }, true, 'Blue House', '2026-06-17', 'm1', FB_NO_PASSES), // 33'; booked 20'
  line('p-neil', 'football', { shots: 1, fouls: 1 }, true, 'Blue House', '2026-06-17', 'm1', FB_NO_PASSES),
  line('p-ishaan', 'football', { goals: 1, shots: 2, shotsOnTarget: 2, yellowCards: 1 }, false, 'Red House', '2026-06-17', 'm1', FB_NO_PASSES), // 23'; booked 26'

  // Brazil vs Norway (live, m-bra-nor) — early goal + chances; Brazil 1–0.
  line('p-bra-9', 'football', { goals: 1, openPlayGoals: 1, shots: 2, shotsOnTarget: 2 }, true, 'Norway', '2026-06-17', 'm-bra-nor', WC_TRACK), // Vinícius 7'
  line('p-bra-7', 'football', { assists: 1 }, true, 'Norway', '2026-06-17', 'm-bra-nor', WC_TRACK), // Bruno Guimarães assist (starter)
  line('p-bra-10', 'football', { shots: 1 }, true, 'Norway', '2026-06-17', 'm-bra-nor', WC_TRACK), // Cunha
  line('p-nor-10', 'football', { shots: 1 }, false, 'Brazil', '2026-06-17', 'm-bra-nor', WC_TRACK), // Haaland
  line('p-nor-11', 'football', { shots: 1, shotsOnTarget: 1 }, false, 'Brazil', '2026-06-17', 'm-bra-nor', WC_TRACK), // Sørloth

  // Portugal vs Spain (live, m-por-esp) — early goal + chances; Portugal 1–0.
  line('p-por-11', 'football', { goals: 1, openPlayGoals: 1, shots: 1, shotsOnTarget: 1 }, true, 'Spain', '2026-06-17', 'm-por-esp', WC_TRACK), // Ronaldo 9'
  line('p-por-9', 'football', { assists: 1, shots: 1, shotsOnTarget: 1 }, true, 'Spain', '2026-06-17', 'm-por-esp', WC_TRACK), // Bruno assist + shot
  line('p-esp-11', 'football', { shots: 1 }, false, 'Portugal', '2026-06-17', 'm-por-esp', WC_TRACK), // Yamal
  line('p-esp-10', 'football', { shots: 1, shotsOnTarget: 1 }, false, 'Portugal', '2026-06-17', 'm-por-esp', WC_TRACK), // Oyarzabal

  // Argentina vs Egypt (live, m-arg-egy) — 1–1: Messi & Salah trade early goals.
  line('p-arg-11', 'football', { goals: 1, openPlayGoals: 1, shots: 2, shotsOnTarget: 2 }, false, 'Egypt', '2026-06-17', 'm-arg-egy', WC_TRACK), // Messi 8'
  line('p-arg-10', 'football', { assists: 1, shots: 1 }, false, 'Egypt', '2026-06-17', 'm-arg-egy', WC_TRACK), // Álvarez assist + shot
  line('p-egy-10', 'football', { goals: 1, openPlayGoals: 1, shots: 2, shotsOnTarget: 2 }, false, 'Argentina', '2026-06-17', 'm-arg-egy', WC_TRACK), // Salah 12'
  line('p-egy-9', 'football', { assists: 1 }, false, 'Argentina', '2026-06-17', 'm-arg-egy', WC_TRACK), // Ashour assist (starter)

  // Falcons vs City Strikers (live cup tie, kc3) — per-player lines matching the
  // seeded events so the Summary shows ratings. Level 1–1, so won:false for both.
  line('p-bpl-rahul', 'football', { goals: 1, shots: 3, shotsOnTarget: 3 }, false, 'City Strikers', '2026-06-17', 'kc3', FB_NO_PASSES), // 18'
  line('p-bpl-aditya', 'football', { shots: 1, shotsOnTarget: 1, fouls: 1, yellowCards: 1 }, false, 'City Strikers', '2026-06-17', 'kc3', FB_NO_PASSES),
  line('p-fal-3', 'football', { shots: 1, fouls: 1 }, false, 'City Strikers', '2026-06-17', 'kc3', FB_NO_PASSES),
  line('p-bpl-sameer', 'football', { goals: 1, shots: 3, shotsOnTarget: 1, fouls: 1, yellowCards: 1 }, false, 'Falcons FC', '2026-06-17', 'kc3', FB_NO_PASSES), // 37'
  line('p-str-2', 'football', { shots: 2, shotsOnTarget: 1, fouls: 1, yellowCards: 1 }, false, 'Falcons FC', '2026-06-17', 'kc3', FB_NO_PASSES),

  // Indiranagar vs Koramangala (live, cg7) — per-player lines matching the
  // seeded box score so the live basketball match's Summary shows ratings.
  line('p-ind-1', 'basketball', { points: 5, rebounds: 1, assists: 1 }, true, 'Koramangala Kings', '2026-06-17', 'cg7'),
  line('p-ind-5', 'basketball', { points: 5, rebounds: 1 }, true, 'Koramangala Kings', '2026-06-17', 'cg7'),
  line('p-ind-3', 'basketball', { points: 4, fouls: 1 }, true, 'Koramangala Kings', '2026-06-17', 'cg7'),
  line('p-ind-4', 'basketball', { rebounds: 2, assists: 1 }, true, 'Koramangala Kings', '2026-06-17', 'cg7'),
  line('p-kor-1', 'basketball', { points: 5, assists: 1 }, false, 'Indiranagar United', '2026-06-17', 'cg7'),
  line('p-kor-5', 'basketball', { points: 4, rebounds: 1, fouls: 1 }, false, 'Indiranagar United', '2026-06-17', 'cg7'),
  line('p-kor-3', 'basketball', { points: 2, fouls: 1 }, false, 'Indiranagar United', '2026-06-17', 'cg7'),
  line('p-kor-4', 'basketball', { rebounds: 2, assists: 1 }, false, 'Indiranagar United', '2026-06-17', 'cg7'),

  // ---- Spring Carnival (t3) — tied to its completed matches (s1–s8) so the
  // tournament's own leaders are scoped to it; the unmapped lines below (tennis,
  // badminton, kabaddi) stay as general career history. ----
  line('p-aarav', 'football', { goals: 2, assists: 1, shots: 6, shotsOnTarget: 4, tackles: 2 }, true, 'Blue House', '2026-04-06', 's1', FB_NO_PASSES),
  line('p-aarav', 'football', { goals: 3, assists: 0, shots: 3, shotsOnTarget: 2 }, true, 'Green House', '2026-04-12', 's3', FB_NO_PASSES),
  line('p-aarav', 'cricket', { runs: 71, wickets: 1 }, true, 'Blue House', '2026-04-14', 's6'),
  line('p-aarav', 'tennis', { points: 52, aces: 6 }, true, 'Smash Academy', '2026-04-18'),
  // Red House squad depth.
  line('p-neil', 'football', { goals: 4, assists: 2 }, true, 'Blue House', '2026-04-06', 's1'),
  line('p-neil', 'cricket', { runs: 44, wickets: 2 }, true, 'Blue House', '2026-04-14', 's6'),
  line('p-sana', 'volleyball', { points: 19, aces: 5 }, true, 'Gold House', '2026-04-17', 's8'),
  line('p-sana', 'basketball', { points: 16, rebounds: 7, assists: 3 }, false, 'Green House', '2026-04-08'),
  // Blue House.
  line('p-maya', 'football', { goals: 1, assists: 3, cleanSheets: 1 }, false, 'Red House', '2026-04-06', 's1'),
  line('p-veer', 'basketball', { points: 24, rebounds: 6, assists: 4 }, false, 'Green House', '2026-04-09', 's5'),
  line('p-veer', 'cricket', { runs: 38, wickets: 3 }, false, 'Red House', '2026-04-14', 's6'),
  // Green House.
  line('p-arnav', 'football', { goals: 2, assists: 1 }, false, 'Red House', '2026-04-12', 's3'),
  line('p-arnav', 'kabaddi', { raidPoints: 11, tacklePoints: 5 }, true, 'Gold House', '2026-06-16'),
  line('p-anika', 'tennis', { points: 47, aces: 4 }, true, 'Baseline TC', '2026-04-18'),
  line('p-anika', 'badminton', { points: 55, games: 3 }, true, 'Smash Academy', '2026-04-16'),
  // Gold House.
  line('p-rehan', 'football', { goals: 3, assists: 2 }, true, 'Blue House', '2026-04-06'),
  line('p-rehan', 'volleyball', { points: 22, aces: 7 }, false, 'Red House', '2026-04-17', 's8'),
  line('p-tanvi', 'basketball', { points: 18, rebounds: 9, assists: 2 }, true, 'Red House', '2026-04-08'),
  line('p-tanvi', 'badminton', { points: 49, games: 2 }, true, 'Green House', '2026-04-16'),
  // Community depth.
  line('p-laila', 'badminton', { points: 66, games: 4 }, true, 'State Meet', '2026-05-18'),
  line('p-laila', 'tennis', { points: 60, aces: 9 }, true, 'Open Round 1', '2026-05-22'),
  line('p-omar', 'basketball', { points: 28, rebounds: 11, assists: 5 }, true, 'League W4', '2026-06-02'),
  line('p-ria', 'football', { goals: 6, assists: 4 }, true, 'Coastal Cup', '2026-05-30'),
  line('p-ria', 'volleyball', { points: 26, aces: 9 }, true, 'Beach Series', '2026-06-01'),
  line('p-jay', 'kabaddi', { raidPoints: 14, tacklePoints: 7 }, true, 'South Zone', '2026-05-28'),
  line('p-jay', 'cricket', { runs: 29, wickets: 4 }, false, 'Raiders Cup', '2026-05-20'),

  // ---- Annual Sports Meet (t1) — stat lines tied to its COMPLETED matches so
  // the tournament's own leaders are populated (and scoped to t1). ----
  // Football: f1 RED 3–1 BLU, f2 GRN 2–0 GLD, f3 RED 1–1 GRN, f4 GLD 2–1 BLU
  line('p-rohan', 'football', { goals: 1, assists: 1 }, true, 'Blue House', '2026-06-13', 'f1'),
  line('p-ishaan', 'football', { goals: 1 }, false, 'Red House', '2026-06-13', 'f1'),
  line('p-arnav', 'football', { goals: 2 }, true, 'Gold House', '2026-06-13', 'f2'),
  line('p-arnav', 'football', { goals: 1, assists: 1 }, false, 'Red House', '2026-06-12', 'f3'),
  line('p-rehan', 'football', { goals: 2 }, true, 'Blue House', '2026-06-13', 'f4'),
  line('p-veer', 'football', { goals: 1 }, false, 'Gold House', '2026-06-13', 'f4'),
  // Cricket: ck1 RED 148–132 GLD, ck2 BLU 165–150 GRN
  line('p-aarav', 'cricket', { runs: 54, wickets: 0 }, true, 'Gold House', '2026-06-13', 'ck1'),
  line('p-neil', 'cricket', { runs: 44, wickets: 1 }, true, 'Gold House', '2026-06-13', 'ck1'),
  line('p-kabir', 'cricket', { runs: 22, wickets: 2 }, false, 'Red House', '2026-06-13', 'ck1'),
  line('p-ishaan', 'cricket', { runs: 62, wickets: 1 }, true, 'Green House', '2026-06-13', 'ck2'),
  line('p-veer', 'cricket', { runs: 38, wickets: 3 }, true, 'Green House', '2026-06-13', 'ck2'),
  // Basketball: bk1 GRN 72–65 RED, bk2 GLD 80–88 BLU
  line('p-ananya', 'basketball', { points: 22, rebounds: 8, assists: 4 }, true, 'Red House', '2026-06-13', 'bk1'),
  line('p-aarav', 'basketball', { points: 18, rebounds: 5 }, false, 'Green House', '2026-06-13', 'bk1'),
  line('p-veer', 'basketball', { points: 24, assists: 5 }, true, 'Gold House', '2026-06-13', 'bk2'),
  line('p-kabir', 'basketball', { points: 20, rebounds: 9 }, false, 'Blue House', '2026-06-13', 'bk2'),

  // ---- Spring Carnival (t3) — round out cricket (s7) & basketball (s4). ----
  line('p-kabir', 'cricket', { runs: 48, wickets: 1 }, true, 'Green House', '2026-04-15', 's7'),
  line('p-arnav', 'cricket', { runs: 40, wickets: 2 }, false, 'Gold House', '2026-04-15', 's7'),
  line('p-aarav', 'basketball', { points: 16, assists: 4 }, true, 'Gold House', '2026-04-08', 's4'),
  line('p-meera', 'basketball', { points: 20, rebounds: 8 }, false, 'Red House', '2026-04-08', 's4'),

  // ---- Bengaluru Premier League (t2) — club football, tied to b1–b6. ----
  line('p-bpl-rahul', 'football', { goals: 2 }, true, 'City Strikers', '2026-05-10', 'b1'),
  line('p-bpl-sameer', 'football', { goals: 1 }, false, 'Falcons FC', '2026-05-10', 'b1'),
  line('p-bpl-joel', 'football', { goals: 2 }, true, 'Titan Athletic', '2026-05-12', 'b2'),
  line('p-bpl-rahul', 'football', { goals: 2, assists: 1 }, true, 'Titan Athletic', '2026-05-14', 'b3'),
  line('p-bpl-aditya', 'football', { goals: 1 }, true, 'Titan Athletic', '2026-05-14', 'b3'),
  line('p-bpl-sameer', 'football', { goals: 2 }, true, 'Titan Athletic', '2026-05-18', 'b5'),
  line('p-bpl-rahul', 'football', { goals: 3 }, true, 'Rovers United', '2026-05-20', 'b6'),
  line('p-bpl-joel', 'football', { goals: 1, assists: 2 }, false, 'Falcons FC', '2026-05-20', 'b6'),
];

// Seed the lineup for the live house football match (m1): Red home, Blue away.
// m1 is a 7-a-side tie, so it fields a full 7 each in a 2-3-1 (GK · 2 def · 3 mid
// · 1 fwd) — not the 11-slot template — with one benched sub per side.
function sevenASide(): LineupSlot[] {
  return [
    { position: 'GK', x: 0.5, y: 0.06 },
    { position: 'CB', x: 0.3, y: 0.26 },
    { position: 'CB', x: 0.7, y: 0.26 },
    { position: 'LM', x: 0.2, y: 0.52 },
    { position: 'CM', x: 0.5, y: 0.5 },
    { position: 'RM', x: 0.8, y: 0.52 },
    { position: 'ST', x: 0.5, y: 0.84 },
  ];
}
function seedLineup(): MatchLineup {
  const home = sevenASide();
  const away = sevenASide();
  const put = (slots: LineupSlot[], position: string, id: string, name: string) => {
    const slot = slots.find((s) => s.position === position && !s.playerId);
    if (slot) { slot.playerId = id; slot.playerName = name; }
  };
  // Red XI (Harsha benched, comes on for Varun at 30' — see the m1 SUB event).
  put(home, 'GK', 'p-neil', 'Neil Kapoor');
  put(home, 'CB', 'p-rh-3', 'Nikhil Shetty');
  put(home, 'CB', 'p-rh-1', 'Kiran Rao');
  put(home, 'LM', 'p-rh-6', 'Varun Kamath');
  put(home, 'CM', 'p-rohan', 'Rohan Nair');
  put(home, 'RM', 'p-rh-7', 'Rakesh Gowda');
  put(home, 'ST', 'p-aarav', 'Aarav Mehta');
  // Blue XI (Aman benched).
  put(away, 'GK', 'p-maya', 'Maya Pillai');
  put(away, 'CB', 'p-bh-6', 'Karan Mehta');
  put(away, 'CB', 'p-bh-2', 'Rohit Pillai');
  put(away, 'LM', 'p-bh-1', 'Faisal Khan');
  put(away, 'CM', 'p-bh-3', 'Sameer Das');
  put(away, 'RM', 'p-ishaan', 'Ishaan Verma');
  put(away, 'ST', 'p-bh-7', 'Vivek Shenoy');
  return { home, away, homeFormation: '2-3-1', awayFormation: '2-3-1' };
}

// Seed the live basketball match (cg7): Indiranagar United home, Koramangala away.
// Places the starting five on the court so the Lineups tab reads like the seeded
// football live matches (PG = playmaker, C = the rebounder), instead of a blank
// court of position labels.
function seedBasketballLineup(): MatchLineup {
  const home = courtFormation('basketball');
  const away = courtFormation('basketball');
  const put = (slots: LineupSlot[], position: string, id: string, name: string) => {
    const slot = slots.find((s) => s.position === position && !s.playerId);
    if (slot) { slot.playerId = id; slot.playerName = name; }
  };
  // IND starting five
  put(home, 'PG', 'p-ind-1', 'Tej Anand');
  put(home, 'SG', 'p-ind-3', 'Sahil Verma');
  put(home, 'SF', 'p-ind-5', 'Akash Pillai');
  put(home, 'PF', 'p-ind-2', 'Rohan Bhatt');
  put(home, 'C', 'p-ind-4', 'Nidhi Rao');
  // KOR starting five
  put(away, 'PG', 'p-kor-1', 'Vinay Kumar');
  put(away, 'SG', 'p-kor-3', 'Manoj Pai');
  put(away, 'SF', 'p-kor-5', 'Rohit Gowda');
  put(away, 'PF', 'p-kor-2', 'Deepak Nair');
  put(away, 'C', 'p-kor-4', 'Priya Shet');
  return { home, away };
}

// Matchday squads for the live basketball match (cg7) — the same starting five as
// the seeded lineup, so the Info tab reads "✓ Squad set" like the other live matches.
const CG7_SQUADS: MatchSquads = {
  home: { starters: ['p-ind-1', 'p-ind-3', 'p-ind-5', 'p-ind-2', 'p-ind-4'], subs: [] },
  away: { starters: ['p-kor-1', 'p-kor-3', 'p-kor-5', 'p-kor-2', 'p-kor-4'], subs: [] },
};

// Seed the live cup final (kc3): Falcons FC home, City Strikers away — a full
// 4-3-3 XI each so the lineup, box score and scorer pickers read like a real
// 11-a-side match (the two goalscorers stay up top).
function seedCupLineup(): MatchLineup {
  const home = emptyFormation();
  const away = emptyFormation();
  const put = (slots: typeof home, position: string, id: string, name: string) => {
    const slot = slots.find((s) => s.position === position && !s.playerId);
    if (slot) { slot.playerId = id; slot.playerName = name; }
  };
  // Falcons XI
  put(home, 'GK', 'p-fal-4', 'Ravi Kulkarni');
  put(home, 'LB', 'p-fal-6', 'Anand Bhat');
  put(home, 'CB', 'p-fal-3', 'Dinesh Kamath');
  put(home, 'CB', 'p-fal-7', 'Girish Naik');
  put(home, 'RB', 'p-fal-5', 'Sunil Prabhu');
  put(home, 'CM', 'p-fal-8', 'Prakash Rao');
  put(home, 'CM', 'p-fal-9', 'Vinod Shetty');
  put(home, 'CM', 'p-fal-10', 'Harish Gowda');
  put(home, 'LW', 'p-bpl-aditya', 'Aditya Shetty');
  put(home, 'ST', 'p-bpl-rahul', 'Rahul Menon');
  put(home, 'RW', 'p-fal-11', 'Sudhir Rai');
  // City Strikers XI
  put(away, 'GK', 'p-str-3', 'Mahesh Iyer');
  put(away, 'LB', 'p-str-5', 'Ashok Menon');
  put(away, 'CB', 'p-str-2', 'Bharat Singh');
  put(away, 'CB', 'p-str-6', 'Ramesh Shetty');
  put(away, 'RB', 'p-str-4', 'Ganesh Rao');
  put(away, 'CM', 'p-str-7', 'Vijay Kamath');
  put(away, 'CM', 'p-str-8', 'Karthik Nair');
  put(away, 'CM', 'p-str-9', 'Prasad Gowda');
  put(away, 'LW', 'p-str-10', 'Sachin Bhat');
  put(away, 'ST', 'p-bpl-sameer', 'Sameer Khan');
  put(away, 'RW', 'p-str-11', 'Faisal Rahman');
  return { home, away };
}

// Matchday squads for the live house football match (m1) — mirrors seedLineup's
// fielded XI + the benched player each side has (Harsha/Aman), matching the seeded
// 30' substitution (Varun → Harsha). Makes Info read "✓ Squad set".
const M1_SQUADS: MatchSquads = {
  home: { starters: ['p-neil', 'p-rh-3', 'p-rh-1', 'p-rh-6', 'p-rohan', 'p-rh-7', 'p-aarav'], subs: ['p-rh-9'] },
  away: { starters: ['p-maya', 'p-bh-6', 'p-bh-2', 'p-bh-1', 'p-bh-3', 'p-ishaan', 'p-bh-7'], subs: ['p-bh-9'] },
};

// Matchday squads for the cup final (kc3) — the seeded XI, so Info reads "✓ Squad set".
const KC3_SQUADS: MatchSquads = {
  home: { starters: ['p-fal-4', 'p-fal-6', 'p-fal-3', 'p-fal-7', 'p-fal-5', 'p-fal-8', 'p-fal-9', 'p-fal-10', 'p-bpl-aditya', 'p-bpl-rahul', 'p-fal-11'], subs: ['p-fal-12', 'p-fal-13', 'p-fal-14'] },
  away: { starters: ['p-str-3', 'p-str-5', 'p-str-2', 'p-str-6', 'p-str-4', 'p-str-7', 'p-str-8', 'p-str-9', 'p-str-10', 'p-bpl-sameer', 'p-str-11'], subs: ['p-str-12', 'p-str-13', 'p-str-14'] },
};

// Matchday squads for the live kabaddi match (m4) — the six kabaddi players each
// house fields, so Info reads "✓ Squad set".
const M4_SQUADS: MatchSquads = {
  home: { starters: ['p-ishaan', 'p-bh-1', 'p-bh-2', 'p-bh-3', 'p-bh-6', 'p-bh-7'], subs: [] },
  away: { starters: ['p-yh-1', 'p-yh-2', 'p-yh-6', 'p-yh-8', 'p-yh-9', 'p-meera'], subs: [] },
};

// Matchday sixes for the live volleyball match (m10) — the players in the seeded
// point log, so Info reads "✓ Squad set".
const M10_SQUADS: MatchSquads = {
  home: { starters: ['p-rohan', 'p-sana', 'p-rh-1', 'p-rh-2', 'p-rh-4', 'p-rh-7'], subs: ['p-rh-5', 'p-rh-9'] },
  away: { starters: ['p-maya', 'p-bh-1', 'p-bh-2', 'p-bh-4', 'p-bh-7', 'p-bh-9'], subs: ['p-bh-5'] },
};

// The two doubles pairs for the live badminton match (m11) — Info reads "✓ Squad set".
const M11_SQUADS: MatchSquads = {
  home: { starters: ['p-aanya', 'p-rh-8'], subs: [] },
  away: { starters: ['p-bh-5', 'p-bh-8'], subs: [] },
};

// The two singles players for the live tennis match (m12) — Info reads "✓ Squad set".
const M12_SQUADS: MatchSquads = {
  home: { starters: ['p-rh-6'], subs: [] },
  away: { starters: ['p-bh-3'], subs: [] },
};

// The sixes for the completed volleyball match (m5) — the players in its seeded log.
const M5_SQUADS: MatchSquads = {
  home: { starters: ['p-diya', 'p-ananya', 'p-gh-3', 'p-gh-6', 'p-gh-9', 'p-gh-10'], subs: [] },
  away: { starters: ['p-rohan', 'p-sana', 'p-rh-1', 'p-rh-2', 'p-rh-4', 'p-rh-7'], subs: [] },
};

const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();
const SEED_LISTINGS: Listing[] = [
  {
    id: 'lst-1', kind: 'player_seeking_team', sport: 'cricket', authorId: 'p-ishaan', authorName: 'Ishaan Verma',
    position: 'All-rounder (right-hand bat, left-arm spin)', city: 'Bengaluru',
    details: 'Looking to join a weekend league side. Played 4 seasons of club cricket. Available Sat & Sun.',
    contactPhone: '+91 90000 11111', contactVerified: true, createdAt: hoursAgo(3),
  },
  {
    id: 'lst-2', kind: 'team_seeking_player', sport: 'football', authorName: 'Bengaluru Strikers', teamName: 'Bengaluru Strikers',
    position: 'Goalkeeper', city: 'Bengaluru',
    details: 'We need a reliable GK for our Sunday 7-a-side league. Friendly squad, two trainings a week.',
    contactPhone: '+91 90000 22222', createdAt: hoursAgo(8),
  },
  {
    id: 'lst-3', kind: 'team_seeking_opponent', sport: 'cricket', authorName: 'City Cricket Club', teamName: 'City Cricket Club',
    city: 'Bengaluru', preferredDate: 'Sun 21 Jun, 7 AM', level: 'Friendly',
    details: 'Looking for a 20-over match this Sunday morning. We can host or travel within the city.',
    contactPhone: '+91 90000 33333', createdAt: hoursAgo(20),
  },
  {
    id: 'lst-4', kind: 'team_seeking_ground', sport: 'football', authorName: 'Rovers United', teamName: 'Rovers United',
    city: 'Bengaluru', preferredDate: 'Fri 19 Jun, 9 PM',
    details: 'Need a turf with floodlights for a 9 PM kickoff on Friday. Koramangala / HSR preferred.',
    contactPhone: '+91 90000 44444', createdAt: hoursAgo(28),
  },
];

const SEED_ORGS: Organization[] = [
  {
    id: 'org-greenwood', name: 'Greenwood High School', type: 'School', city: 'Bengaluru',
    email: 'sports@greenwood.edu', phone: '+91 80000 10000',
    bio: 'School sports department — runs the annual meet and seasonal carnivals.',
    // Academic years run Jun→Apr (organizing here since 2023); Grade 10 graduates.
    // The latest recorded year (2025–26) has ended, so admins are prompted to set
    // up the new one — and "next" extrapolates to 2026–27.
    graduatingStandard: 'Grade 10',
    academicYears: [
      { label: '2023–24', start: '2023-06-01', end: '2024-04-30' },
      { label: '2024–25', start: '2024-06-01', end: '2025-04-30' },
      { label: '2025–26', start: '2025-06-01', end: '2026-04-30' },
    ],
    // A realistic mix: multiple admins (staff + one student exception), staff &
    // student organizers/scorers, students across grades, and a graduated alum.
    // Members WITH a class timeline are students; those without are staff.
    members: [
      // ── Admins ── normally staff/management; Aarav is the student exception.
      { playerId: 'p-aarav', role: 'Admin', since: '2023-06-01', grades: [
        { standard: 'Grade 8', since: '2023-06-01', until: '2024-06-15' },
        { standard: 'Grade 9', since: '2024-06-15', until: '2025-06-15' },
        { standard: 'Grade 10', since: '2025-06-15' },
      ] }, // student head-boy, also admin (flagged + rights revoked on graduation)
      { playerId: 'p-vikram', role: 'Admin', since: '2018-04-01' }, // Principal (staff)
      { playerId: 'p-suresh', role: 'Admin', since: '2020-06-01' }, // Sports Director (staff)
      // ── Organizers ── one staff PE teacher, one student sports captain.
      { playerId: 'p-ishaan', role: 'Organizer', since: '2019-06-01' }, // PE teacher (staff)
      { playerId: 'p-kabir', role: 'Organizer', since: '2021-06-15', grades: [
        { standard: 'Grade 9', since: '2024-06-15', until: '2025-06-15' },
        { standard: 'Grade 10', since: '2025-06-15' },
      ] }, // student sports captain (organizer rights revoked on graduation)
      // ── Scorers ── staff + a senior student who helps score.
      { playerId: 'p-rohan', role: 'Scorer', since: '2022-04-01' }, // staff
      { playerId: 'p-dev', role: 'Scorer', since: '2023-06-15', grades: [
        { standard: 'Grade 8', since: '2024-06-15', until: '2025-06-15' },
        { standard: 'Grade 9', since: '2025-06-15' },
      ] },
      // ── Member students across grades — drive the rollover & tournament-class views.
      { playerId: 'p-meera', role: 'Member', since: '2024-06-15', grades: [
        { standard: 'Grade 7', since: '2024-06-15', until: '2025-06-15' },
        { standard: 'Grade 8', since: '2025-06-15' },
      ] },
      { playerId: 'p-neil', role: 'Member', since: '2024-06-01', grades: [
        { standard: 'Grade 8', since: '2024-06-15', until: '2025-06-15' },
        { standard: 'Grade 9', since: '2025-06-15' },
      ] },
      { playerId: 'p-diya', role: 'Member', since: '2023-06-15', grades: [
        { standard: 'Grade 8', since: '2024-06-15', until: '2025-06-15' },
        { standard: 'Grade 9', since: '2025-06-15' },
      ] },
      { playerId: 'p-ananya', role: 'Member', since: '2022-06-15', grades: [
        { standard: 'Grade 9', since: '2024-06-15', until: '2025-06-15' },
        { standard: 'Grade 10', since: '2025-06-15' },
      ] }, // graduating-class member
      // ── A graduated alumnus — past member with a completed class history.
      { playerId: 'p-zoya', role: 'Member', since: '2023-06-01', until: '2025-06-15', grades: [
        { standard: 'Grade 9', since: '2023-06-15', until: '2024-06-15' },
        { standard: 'Grade 10', since: '2024-06-15', until: '2025-06-15' },
      ] },
    ],
  },
  {
    // Aarav's previous school — a *past* community (same "School" category as
    // Greenwood, so only one of them may be active at a time). He moved here →
    // Greenwood, so this membership has an end date.
    id: 'org-dwps', name: 'Delhi World Public School, Kompally', type: 'School', city: 'Hyderabad',
    email: 'office@dwps-kompally.edu', phone: '+91 40000 30000',
    bio: 'CBSE school in Kompally with an active inter-house sports programme.',
    members: [
      { playerId: 'p-aarav', role: 'Member', since: '2019-06-01', until: '2023-05-31' },
    ],
  },
  {
    // Different category (Housing society) → can be active in parallel with a school.
    id: 'org-myhome', name: 'My Home Towers', type: 'Housing society', city: 'Hyderabad',
    email: 'club@myhometowers.in', phone: '+91 40000 40000',
    bio: 'Residents’ sports club — weekend box-cricket and badminton ladders.',
    members: [
      { playerId: 'p-aarav', role: 'Admin', since: '2022-01-15' },
    ],
  },
  {
    id: 'org-bpl', name: 'BPL Football', type: 'Sports club', city: 'Bengaluru',
    email: 'hello@bplfootball.in', phone: '+91 80000 20000',
    bio: 'Independent league body running the Bengaluru Premier League.',
    // A non-academic community with two admins and every role represented (no
    // class timelines here — only schools/colleges track grades).
    members: [
      { playerId: 'p-arjun', role: 'Admin', since: '2021-03-01' },
      { playerId: 'p-sara', role: 'Admin', since: '2021-03-01' },
      { playerId: 'p-vivaan', role: 'Organizer', since: '2021-03-01' },
      { playerId: 'p-tara', role: 'Scorer', since: '2022-08-01' },
      { playerId: 'p-isha', role: 'Member', since: '2023-01-10' },
    ],
  },
];

const ALL_MATCHES = [...MATCHES, WC_MATCH, BN_MATCH, PE_MATCH, AE_MATCH];

// ---- Anchor the seed to "now" --------------------------------------------
// The sample data is authored around a mid-June 2026 "today" (the tournament
// comments call the meet "ongoing right now"). Shift every date by the whole-day
// gap to the real today so a few tournaments always read as live/upcoming (the
// Organize hub, Calendar) and the agenda populates around the current day —
// instead of the demo drifting empty as real time passes the fixed seed dates. A
// whole-day shift preserves every relative relationship (which tournaments
// overlap, match orderings, how recent the history is). Computed once at seed
// build; DEMO_KEY is versioned, so bumping it re-anchors an existing save.
const SEED_ANCHOR_MS = Date.parse('2026-06-17T00:00:00');
const DEMO_DAY_SHIFT = Math.round((Date.now() - SEED_ANCHOR_MS) / 86_400_000);
const pad2 = (n: number) => String(n).padStart(2, '0');
/** Shift a 'YYYY-MM-DD' or 'YYYY-MM-DDTHH:MM:SS' string by DEMO_DAY_SHIFT days. */
function anchorDate(iso: string): string {
  if (!iso) return iso;
  const [datePart, timePart] = iso.split('T');
  const d = new Date(`${datePart}T00:00:00`);
  if (isNaN(d.getTime())) return iso;
  d.setDate(d.getDate() + DEMO_DAY_SHIFT);
  const shifted = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  return timePart ? `${shifted}T${timePart}` : shifted;
}

export const demo = {
  tournaments: [...TOURNAMENTS, WC_TOURNAMENT].map((t) => ({ ...t, startDate: anchorDate(t.startDate), endDate: anchorDate(t.endDate) })) as Tournament[],
  organizations: SEED_ORGS,
  matches: ALL_MATCHES.map((m) => ({ ...m, startsAt: anchorDate(m.startsAt) })) as Match[],
  teams: deriveTeams(ALL_MATCHES),
  players: [...players, ...WC_PLAYERS, ...BN_PLAYERS, ...PE_PLAYERS, ...AE_PLAYERS],
  statLines: statLines.map((s) => ({ ...s, date: s.date ? anchorDate(s.date) : s.date })),
  // m4 (kabaddi) intentionally has empty lineups — kabaddi's positional court is
  // hidden for now (only 6 kabaddi players per house), so its Score tab shows the
  // timeline + player stats without a half-empty mat.
  lineups: { m1: seedLineup(), cg7: seedBasketballLineup(), kc3: seedCupLineup(), m4: { home: [], away: [] }, m10: { home: [], away: [] }, m11: { home: [], away: [] }, m12: { home: [], away: [] }, m5: { home: [], away: [] }, 'm-eng-cro': WC_LINEUP, 'm-bra-nor': BN_LINEUP, 'm-por-esp': PE_LINEUP, 'm-arg-egy': AE_LINEUP } as Record<string, MatchLineup>,
  /** append-only scoring log per match — mirrors the Supabase match_events table.
   *  The completed cricket fixtures ship a full ball-by-ball log so they replay to
   *  a real, ENDED scorecard, and the live cricket fixture (m8) ships a mid-innings
   *  log so it opens on a real in-progress card (see cricketSeed.ts); the other live
   *  logs are added below. */
  matchEvents: { ...CRICKET_MATCH_EVENTS, ...CRICKET_LIVE_EVENTS } as Record<string, MatchEventRecord[]>,
  /** matchday squads (starting XI + subs) per match */
  matchSquads: { m1: M1_SQUADS, m4: M4_SQUADS, m10: M10_SQUADS, m11: M11_SQUADS, m12: M12_SQUADS, m5: M5_SQUADS, 'm-eng-cro': WC_SQUADS, 'm-bra-nor': BN_SQUADS, 'm-por-esp': PE_SQUADS, 'm-arg-egy': AE_SQUADS, cg7: CG7_SQUADS, kc3: KC3_SQUADS, ...CRICKET_LIVE_SQUADS } as Record<string, MatchSquads>,
  /** player participation objections (identity disputes) across matches */
  disputes: [] as MatchDispute[],
  /** team invites keyed by token, and the teams the demo user captains */
  invites: {} as Record<string, TeamInvite>,
  captainTeams: new Set<string>(),
  footballProfiles: {
    'p-aarav': { position: 'ST', foot: 'Right', teams: ['Red House', 'City Juniors U16'], bio: 'Quick striker, strong finishing.' },
  } as Record<string, FootballProfile>,
  /** Connect noticeboard posts (newest first). */
  listings: SEED_LISTINGS,
  /** captain & vice-captain per team id (the house mock ids span sports). */
  teamLeaders: {
    rh: { captainId: 'p-aarav', viceCaptainId: 'p-rohan' },
    bh: { captainId: 'p-ishaan', viceCaptainId: 'p-veer' },
    gh: { captainId: 'p-diya', viceCaptainId: 'p-ananya' },
    yh: { captainId: 'p-kabir', viceCaptainId: 'p-meera' },
    bra: { captainId: 'p-bra-4' }, // Marquinhos
    nor: { captainId: 'p-nor-8' }, // Ødegaard
    por: { captainId: 'p-por-11' }, // Ronaldo
    esp: { captainId: 'p-esp-6' }, // Rodri
    arg: { captainId: 'p-arg-11' }, // Messi
    egy: { captainId: 'p-egy-10' }, // Salah
  } as Record<string, TeamLeadership>,
};

// ---------- Demo persistence (AsyncStorage) --------------------------------
// The demo store is in-memory, so a reload/app-kill wipes anything the user
// created. We snapshot it to AsyncStorage (demo mode only) and restore on start.
// Version-keyed so a future seed/shape change discards stale saves cleanly.
const DEMO_KEY = 'sportfolio.demo.v33'; // v33: one invited/pending player (Rehan Malik, Blue House) to demo the add-player pending list

/** captainTeams is a Set (not JSON-safe) → store as an array. */
function serializeDemo(): string {
  return JSON.stringify({ ...demo, captainTeams: [...demo.captainTeams] });
}

function applyDemo(saved: Record<string, unknown>) {
  for (const k of Object.keys(demo) as (keyof typeof demo)[]) {
    if (k === 'captainTeams') { demo.captainTeams = new Set((saved.captainTeams as string[]) ?? []); continue; }
    if (saved[k] !== undefined) (demo as Record<string, unknown>)[k] = saved[k];
  }
  dedupeById();       // heal any duplicate-id rows from before the counter fix
  bumpCounterPastRestored(); // so newly-minted local-* ids never collide with restored ones
}

/** `counter` resets to 1 each app load, but restored data already holds local-*
 *  ids from prior sessions — advance it past the highest so genId() can't collide. */
function bumpCounterPastRestored() {
  let max = 0;
  const re = /"local-[a-z]+-(\d+)"/g;
  const hay = JSON.stringify(demo);
  for (let m = re.exec(hay); m; m = re.exec(hay)) { const n = Number(m[1]); if (n > max) max = n; }
  if (max >= counter) counter = max + 1;
}

/** Drop any array rows that repeat an id (collision damage from the old counter),
 *  keeping the first — prevents duplicate-key render errors & ambiguous lookups. */
function dedupeById() {
  for (const k of Object.keys(demo) as (keyof typeof demo)[]) {
    const v = (demo as Record<string, unknown>)[k];
    if (Array.isArray(v) && v.length && v[0] && typeof v[0] === 'object' && 'id' in (v[0] as object)) {
      const seen = new Set<unknown>();
      (demo as Record<string, unknown>)[k] = (v as { id: unknown }[]).filter((row) => {
        if (seen.has(row.id)) return false;
        seen.add(row.id);
        return true;
      });
    }
  }
}

/** Restore the demo store from disk (call once at startup, before rendering). */
export async function hydrateDemo(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(DEMO_KEY);
    if (raw) applyDemo(JSON.parse(raw));
  } catch {
    // corrupt/unavailable → keep the fresh seed
  }
}

/** Persist the demo store on a short interval (only when it changed) and when the
 *  tab is hidden/closed, so edits survive a reload or app-kill. */
export function startDemoAutosave(): void {
  let last = serializeDemo();
  const save = () => {
    try {
      const s = serializeDemo();
      if (s !== last) { last = s; void AsyncStorage.setItem(DEMO_KEY, s); }
    } catch {
      // ignore transient serialize/storage errors
    }
  };
  setInterval(save, 4000);
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('visibilitychange', save);
    window.addEventListener('pagehide', save);
  }
}

// Seed in-progress event logs so the "live" matches show a real, mid-game score
// (rebuilt through each sport's pure reducer) instead of starting at 0–0.
const nowMs = Date.now();
const bbScore = (seq: number, side: 'home' | 'away', points: number, minute: number, pid: string, name: string, q = 1): MatchEventRecord =>
  ({ seq, type: 'SCORE', side, payload: { points, minute, quarter: q }, attribution: { playerId: pid, stat: 'points', by: points, playerName: name } });
const BB_STAT_KEY: Record<'REBOUND' | 'ASSIST' | 'FOUL', string> = { REBOUND: 'rebounds', ASSIST: 'assists', FOUL: 'fouls' };
const bbStat = (seq: number, side: 'home' | 'away', type: 'REBOUND' | 'ASSIST' | 'FOUL', minute: number, pid: string, name: string, q = 1): MatchEventRecord =>
  ({ seq, type, side, payload: { minute, quarter: q }, attribution: { playerId: pid, stat: BB_STAT_KEY[type], by: 1, playerName: name } });
const fbStat = (seq: number, side: 'home' | 'away', kind: string, o: { onTarget?: boolean; pid?: string; name?: string; statKey?: string; at?: number; possSide?: 'home' | 'away'; minute?: number } = {}): MatchEventRecord =>
  ({ seq, type: 'STAT', side, payload: { kind, onTarget: o.onTarget, at: o.at, possSide: o.possSide, minute: o.minute ?? 0 }, attribution: o.pid ? { playerId: o.pid, stat: o.statKey ?? `${kind}s`, by: 1, playerName: o.name } : null });
const kabPt = (seq: number, type: 'RAID' | 'TACKLE', side: 'home' | 'away', points: number, minute: number, half: 1 | 2, pid: string, name: string): MatchEventRecord =>
  ({ seq, type, side, payload: { points, minute, half }, attribution: { playerId: pid, stat: type === 'RAID' ? 'raidPoints' : 'tacklePoints', by: points, playerName: name } });

// Volleyball point-log generator (m10). Emits POINT/ACE events that replay to the
// exact per-set scores — points rotate across each side's six and every sixth is
// an ace — so the per-set box score has real, reproducible data on both teams.
const VB_HOME: [string, string][] = [['p-rohan', 'Rohan Nair'], ['p-sana', 'Sana Qureshi'], ['p-rh-1', 'Kiran Rao'], ['p-rh-2', 'Aditya Pai'], ['p-rh-4', 'Pooja Hegde'], ['p-rh-7', 'Rakesh Gowda']];
const VB_AWAY: [string, string][] = [['p-maya', 'Maya Pillai'], ['p-bh-1', 'Faisal Khan'], ['p-bh-2', 'Rohit Pillai'], ['p-bh-4', 'Nisha Rao'], ['p-bh-7', 'Vivek Shenoy'], ['p-bh-9', 'Aman Joshi']];
function vbEvents(sets: [number, number][], homeRoster = VB_HOME, awayRoster = VB_AWAY): MatchEventRecord[] {
  const out: MatchEventRecord[] = [];
  let seq = 0, hi = 0, ai = 0;
  const emit = (side: 'home' | 'away') => {
    const roster = side === 'home' ? homeRoster : awayRoster;
    const idx = side === 'home' ? hi++ : ai++; // that side's own running point count
    const [pid, name] = roster[idx % roster.length];
    // Ace ~ every 5th point FOR THAT SIDE (not the global count — else strict
    // home/away alternation would push every ace onto one team). Period 5 vs the
    // 6-player rotation spreads the aces unevenly across the six, like real play.
    const ace = idx % 5 === 4;
    out.push({ seq: ++seq, type: ace ? 'ACE' : 'POINT', side, attribution: { playerId: pid, stat: ace ? 'aces' : 'points', playerName: name } });
  };
  // Interleave 1:1 up to the loser's tally (never a premature set win), then the
  // leader's closing run takes the set to its exact score.
  for (const [h, v] of sets) {
    const lo = Math.min(h, v);
    for (let i = 0; i < lo; i++) { emit('home'); emit('away'); }
    const leader = h >= v ? 'home' : 'away';
    for (let i = 0; i < Math.abs(h - v); i++) emit(leader);
  }
  return out;
}

// Badminton doubles point-log generator (m11). Emits POINT events that replay to
// the exact per-game scores, rotating between each pair's two players — so the
// per-game box score splits each doubles pair's contribution.
const BM_HOME: [string, string][] = [['p-aanya', 'Aanya Mehta'], ['p-rh-8', 'Divya Menon']];
const BM_AWAY: [string, string][] = [['p-bh-5', 'Aisha Begum'], ['p-bh-8', 'Tina Dsa']];
function bmEvents(games: [number, number][]): MatchEventRecord[] {
  const out: MatchEventRecord[] = [];
  let seq = 0, hi = 0, ai = 0;
  const emit = (side: 'home' | 'away') => {
    const roster = side === 'home' ? BM_HOME : BM_AWAY;
    const [pid, name] = roster[(side === 'home' ? hi++ : ai++) % roster.length];
    out.push({ seq: ++seq, type: 'POINT', side, attribution: { playerId: pid, stat: 'points', playerName: name } });
  };
  // Interleave 1:1 up to the loser's tally (never a premature game win), then the
  // leader's closing run takes the game to its exact score.
  for (const [h, v] of games) {
    const lo = Math.min(h, v);
    for (let i = 0; i < lo; i++) { emit('home'); emit('away'); }
    const leader = h >= v ? 'home' : 'away';
    for (let i = 0; i < Math.abs(h - v); i++) emit(leader);
  }
  return out;
}

// Tennis singles point-log generator (m12). Emits POINT/ACE events that replay,
// through the points→games→sets reducer, to exact set/game scores. Each game is
// won on the winner's 4th point (the loser first scores 0–2, so points won ≠ just
// 4×games); aces land ~every 7th point per side. No 6-6 tiebreak in the seed.
const TN_HOME: [string, string] = ['p-rh-6', 'Varun Kamath'];
const TN_AWAY: [string, string] = ['p-bh-3', 'Sameer Das'];
function tnEvents(completedSets: [number, number][], live: { games: [number, number]; cur: [number, number] }): MatchEventRecord[] {
  const out: MatchEventRecord[] = [];
  let seq = 0, hi = 0, ai = 0, gameNo = 0;
  const emit = (side: 'home' | 'away') => {
    const [pid, name] = side === 'home' ? TN_HOME : TN_AWAY;
    const ace = (side === 'home' ? hi++ : ai++) % 7 === 6;
    out.push({ seq: ++seq, type: ace ? 'ACE' : 'POINT', side, attribution: { playerId: pid, stat: ace ? 'aces' : 'points', playerName: name } });
  };
  // One game won by `w`: the loser scores 0–2 points (varied), then `w` takes four
  // straight to close it at 4-0/4-1/4-2 (win by ≥2, never deuce).
  const game = (w: 'home' | 'away') => {
    const l = gameNo++ % 3;
    const loser = w === 'home' ? 'away' : 'home';
    for (let i = 0; i < l; i++) emit(loser);
    for (let i = 0; i < 4; i++) emit(w);
  };
  // Play a set to an exact game score: interleave wins to the loser's tally (no
  // premature set), then the leader closes it out.
  const playSet = (h: number, a: number) => {
    const lo = Math.min(h, a);
    for (let i = 0; i < lo; i++) { game('home'); game('away'); }
    const leader = h >= a ? 'home' : 'away';
    for (let i = 0; i < Math.abs(h - a); i++) game(leader);
  };
  for (const [h, a] of completedSets) playSet(h, a);
  // Live set: its completed games, then a partial current game (never completed).
  const [lh, la] = live.games;
  const lo = Math.min(lh, la);
  for (let i = 0; i < lo; i++) { game('home'); game('away'); }
  const leader = lh >= la ? 'home' : 'away';
  for (let i = 0; i < Math.abs(lh - la); i++) game(leader);
  for (let i = 0; i < live.cur[1]; i++) emit('away');
  for (let i = 0; i < live.cur[0]; i++) emit('home');
  return out;
}
demo.matchEvents['m1'] = [
  { seq: 1, type: 'KICKOFF', side: null, payload: { at: nowMs - 32 * 60000, possSide: 'home' } },
  fbStat(2, 'home', 'shot', { onTarget: true, pid: 'p-aarav', name: 'Aarav Mehta', statKey: 'shots', minute: 11 }),
  { seq: 3, type: 'GOAL', side: 'home', payload: { minute: 12 }, attribution: { playerId: 'p-aarav', stat: 'goals', by: 1, playerName: 'Aarav Mehta' } },
  fbStat(4, 'home', 'shot', { onTarget: false, pid: 'p-rohan', name: 'Rohan Nair', statKey: 'shots', minute: 15 }),
  fbStat(5, 'home', 'corner', { minute: 16 }),
  { seq: 6, type: 'POSSESSION', side: null, payload: { side: 'away', at: nowMs - 22 * 60000 } },
  fbStat(7, 'away', 'shot', { onTarget: true, pid: 'p-ishaan', name: 'Ishaan Verma', statKey: 'shots', minute: 22 }),
  { seq: 8, type: 'GOAL', side: 'away', payload: { minute: 23 }, attribution: { playerId: 'p-ishaan', stat: 'goals', by: 1, playerName: 'Ishaan Verma' } },
  fbStat(9, 'home', 'foul', { pid: 'p-neil', name: 'Neil Kapoor', statKey: 'fouls', possSide: 'away', minute: 25 }),
  { seq: 10, type: 'POSSESSION', side: null, payload: { side: 'home', at: nowMs - 12 * 60000 } },
  fbStat(11, 'home', 'shot', { onTarget: false, pid: 'p-neil', name: 'Neil Kapoor', statKey: 'shots', minute: 31 }),
  { seq: 12, type: 'GOAL', side: 'home', payload: { minute: 33 }, attribution: { playerId: 'p-rohan', stat: 'goals', by: 1, playerName: 'Rohan Nair' } },
  fbStat(13, 'away', 'offside', { minute: 28 }),
  { seq: 14, type: 'YELLOW', side: 'home', payload: { minute: 20 }, attribution: { playerId: 'p-rohan', stat: 'yellowCards', by: 1, playerName: 'Rohan Nair' } },
  { seq: 15, type: 'YELLOW', side: 'away', payload: { minute: 26 }, attribution: { playerId: 'p-ishaan', stat: 'yellowCards', by: 1, playerName: 'Ishaan Verma' } },
  { seq: 16, type: 'SUB', side: 'home', payload: { minute: 30, offName: 'Varun Kamath', onName: 'Harsha Bhat' }, attribution: null },
];
// Split across two quarters (into Q2 now) so the box score's per-quarter toggle
// has real data on both sides. Final unchanged: home 14 · away 11 (Q1 8–7, Q2 6–4);
// every player's Overall line is preserved — only the quarter each play lands in changed.
demo.matchEvents['cg7'] = [
  { seq: 1, type: 'KICKOFF', side: null, payload: { at: nowMs - 18 * 60000 } },
  // — Q1 (8–7) —
  bbScore(2, 'home', 3, 2, 'p-ind-1', 'Tej Anand', 1),
  bbScore(3, 'away', 3, 3, 'p-kor-1', 'Vinay Kumar', 1),
  bbScore(4, 'home', 3, 5, 'p-ind-5', 'Akash Pillai', 1),
  bbScore(5, 'away', 2, 6, 'p-kor-5', 'Rohit Gowda', 1),
  bbScore(6, 'home', 2, 8, 'p-ind-3', 'Sahil Verma', 1),
  bbScore(7, 'away', 2, 9, 'p-kor-3', 'Manoj Pai', 1),
  bbStat(8, 'home', 'ASSIST', 7, 'p-ind-4', 'Nidhi Rao', 1),
  bbStat(9, 'away', 'ASSIST', 8, 'p-kor-1', 'Vinay Kumar', 1),
  bbStat(10, 'home', 'REBOUND', 9, 'p-ind-4', 'Nidhi Rao', 1),
  bbStat(11, 'away', 'REBOUND', 9, 'p-kor-4', 'Priya Shet', 1),
  // — Q2 (6–4), clock ~4' in —
  { seq: 12, type: 'NEXT_QUARTER', side: null, payload: {} },
  { seq: 13, type: 'KICKOFF', side: null, payload: { at: nowMs - 4 * 60000 } },
  bbScore(14, 'home', 2, 1, 'p-ind-1', 'Tej Anand', 2),
  bbScore(15, 'away', 2, 2, 'p-kor-1', 'Vinay Kumar', 2),
  bbScore(16, 'home', 2, 3, 'p-ind-5', 'Akash Pillai', 2),
  bbScore(17, 'away', 2, 4, 'p-kor-5', 'Rohit Gowda', 2),
  bbScore(18, 'home', 2, 5, 'p-ind-3', 'Sahil Verma', 2),
  bbStat(19, 'home', 'ASSIST', 2, 'p-ind-1', 'Tej Anand', 2),
  bbStat(20, 'away', 'FOUL', 2, 'p-kor-3', 'Manoj Pai', 2),
  bbStat(21, 'home', 'REBOUND', 3, 'p-ind-5', 'Akash Pillai', 2),
  bbStat(22, 'away', 'ASSIST', 3, 'p-kor-4', 'Priya Shet', 2),
  bbStat(23, 'home', 'REBOUND', 4, 'p-ind-4', 'Nidhi Rao', 2),
  bbStat(24, 'home', 'FOUL', 4, 'p-ind-3', 'Sahil Verma', 2),
  bbStat(25, 'away', 'REBOUND', 5, 'p-kor-4', 'Priya Shet', 2),
  bbStat(26, 'home', 'REBOUND', 5, 'p-ind-1', 'Tej Anand', 2),
  bbStat(27, 'away', 'REBOUND', 6, 'p-kor-5', 'Rohit Gowda', 2),
  bbStat(28, 'away', 'FOUL', 6, 'p-kor-5', 'Rohit Gowda', 2),
];
// Live kabaddi (m4) — Blue House vs Gold House, into the 2nd half. Raid/tackle
// points across both halves so the Player-stats table's per-half toggle has real
// data. Final (live): Blue 14 · Gold 13.
demo.matchEvents['m4'] = [
  { seq: 1, type: 'KICKOFF', side: null, payload: { at: nowMs - 30 * 60000 } },
  kabPt(2, 'RAID', 'home', 2, 2, 1, 'p-ishaan', 'Ishaan Verma'),
  kabPt(3, 'RAID', 'away', 1, 3, 1, 'p-yh-1', 'Imran Pasha'),
  kabPt(4, 'TACKLE', 'home', 1, 4, 1, 'p-bh-1', 'Faisal Khan'),
  kabPt(5, 'RAID', 'away', 2, 6, 1, 'p-yh-2', 'Naveen Shetty'),
  kabPt(6, 'RAID', 'home', 1, 7, 1, 'p-bh-2', 'Rohit Pillai'),
  kabPt(7, 'TACKLE', 'away', 1, 9, 1, 'p-yh-8', 'Kiran Joshi'),
  kabPt(8, 'RAID', 'home', 2, 11, 1, 'p-bh-6', 'Karan Mehta'),
  kabPt(9, 'RAID', 'away', 2, 13, 1, 'p-yh-6', 'Mahesh Naik'),
  kabPt(10, 'TACKLE', 'home', 1, 15, 1, 'p-bh-3', 'Sameer Das'),
  kabPt(11, 'RAID', 'away', 1, 17, 1, 'p-yh-1', 'Imran Pasha'),
  kabPt(12, 'RAID', 'home', 1, 19, 1, 'p-ishaan', 'Ishaan Verma'),
  { seq: 13, type: 'NEXT_HALF', side: null, payload: {} },
  { seq: 14, type: 'KICKOFF', side: null, payload: { at: nowMs - 10 * 60000 } },
  kabPt(15, 'RAID', 'home', 2, 21, 2, 'p-bh-2', 'Rohit Pillai'),
  kabPt(16, 'RAID', 'away', 2, 22, 2, 'p-yh-2', 'Naveen Shetty'),
  kabPt(17, 'TACKLE', 'away', 1, 23, 2, 'p-yh-9', 'Asha Rao'),
  kabPt(18, 'RAID', 'home', 2, 24, 2, 'p-ishaan', 'Ishaan Verma'),
  kabPt(19, 'TACKLE', 'home', 1, 25, 2, 'p-bh-7', 'Vivek Shenoy'),
  kabPt(20, 'RAID', 'away', 1, 26, 2, 'p-yh-6', 'Mahesh Naik'),
  kabPt(21, 'RAID', 'home', 1, 27, 2, 'p-bh-6', 'Karan Mehta'),
  kabPt(22, 'TACKLE', 'away', 1, 28, 2, 'p-yh-8', 'Kiran Joshi'),
  kabPt(23, 'TACKLE', 'away', 1, 29, 2, 'p-meera', 'Meera Joshi'),
];
// Live volleyball (m10) — Red vs Blue, best of 3. Red took set 1 (25–21); set 2 is
// live at 19–21, so the per-set player-stats toggle has real data on both sides.
demo.matchEvents['m10'] = vbEvents([[25, 21], [19, 21]]);
// Completed volleyball (m5) — Green House beat Red House 3–1 (best of 5). A full
// event log so the finished match shows the broadcast FINAL board (per-set columns
// + winner), not just an aggregate card. Sets: 25-20, 23-25, 25-18, 25-22.
const VB_GREEN: [string, string][] = [['p-diya', 'Diya Rao'], ['p-ananya', 'Ananya Iyer'], ['p-gh-3', 'Sandeep Rao'], ['p-gh-6', 'Girish Naik'], ['p-gh-9', 'Bhavana Rao'], ['p-gh-10', 'Megha Iyer']];
demo.matchEvents['m5'] = vbEvents([[25, 20], [23, 25], [25, 18], [25, 22]], VB_GREEN, VB_HOME);
// Live badminton doubles (m11) — Red pair vs Blue pair, best of 3. Red took game 1
// (21–17); game 2 is live at 14–16, so the per-game player-stats toggle has data.
demo.matchEvents['m11'] = bmEvents([[21, 17], [14, 16]]);
// Live tennis singles (m12) — Varun Kamath (Red) vs Sameer Das (Blue), best of 3.
// Red took set 1 (6–4); set 2 is live at 3–2, 30–15 — so the per-set stats toggle
// has data across both sets.
demo.matchEvents['m12'] = tnEvents([[6, 4]], { games: [3, 2], cur: [2, 1] });
// Cup final (t7): a knockout tie level 1–1 in the 2nd half — ending it goes to
// a penalty shootout. Seeded end-to-end (shots, corners, fouls, cards, offsides
// and possession swings) so the live match's Stats/Timeline/Summary are full,
// not a lone goal apiece. Possession splits ≈ 54–46 via the POSSESSION events.
demo.matchEvents['kc3'] = [
  { seq: 1, type: 'KICKOFF', side: null, payload: { at: nowMs - 80 * 60000, possSide: 'home' } },
  fbStat(2, 'away', 'shot', { onTarget: false, pid: 'p-bpl-sameer', name: 'Sameer Khan', statKey: 'shots', minute: 6 }),
  fbStat(3, 'home', 'shot', { onTarget: true, pid: 'p-bpl-aditya', name: 'Aditya Shetty', statKey: 'shots', minute: 9 }),
  { seq: 4, type: 'POSSESSION', side: null, payload: { side: 'away', at: nowMs - 72 * 60000 } },
  fbStat(5, 'home', 'corner', { minute: 14 }),
  fbStat(6, 'away', 'foul', { pid: 'p-bpl-sameer', name: 'Sameer Khan', statKey: 'fouls', minute: 16 }),
  { seq: 7, type: 'GOAL', side: 'home', payload: { minute: 18 }, attribution: { playerId: 'p-bpl-rahul', stat: 'goals', by: 1, playerName: 'Rahul Menon' } },
  fbStat(8, 'home', 'shot', { onTarget: false, pid: 'p-fal-3', name: 'Dinesh Kamath', statKey: 'shots', minute: 22 }),
  { seq: 9, type: 'POSSESSION', side: null, payload: { side: 'home', at: nowMs - 60 * 60000 } },
  fbStat(10, 'away', 'corner', { minute: 26 }),
  fbStat(11, 'home', 'foul', { pid: 'p-bpl-aditya', name: 'Aditya Shetty', statKey: 'fouls', minute: 29 }),
  fbStat(12, 'away', 'shot', { onTarget: true, pid: 'p-str-2', name: 'Bharat Singh', statKey: 'shots', minute: 33 }),
  { seq: 13, type: 'GOAL', side: 'away', payload: { minute: 37 }, attribution: { playerId: 'p-bpl-sameer', stat: 'goals', by: 1, playerName: 'Sameer Khan' } },
  { seq: 14, type: 'POSSESSION', side: null, payload: { side: 'away', at: nowMs - 48 * 60000 } },
  { seq: 15, type: 'YELLOW', side: 'away', payload: { minute: 40 }, attribution: { playerId: 'p-str-2', stat: 'yellowCards', by: 1, playerName: 'Bharat Singh' } },
  fbStat(16, 'home', 'offside', { minute: 43 }),
  { seq: 17, type: 'NEXT_HALF', side: null, payload: { at: nowMs - 35 * 60000 } },
  { seq: 18, type: 'KICKOFF', side: null, payload: { at: nowMs - 35 * 60000, possSide: 'home' } },
  fbStat(19, 'home', 'shot', { onTarget: true, pid: 'p-bpl-rahul', name: 'Rahul Menon', statKey: 'shots', minute: 52 }),
  fbStat(20, 'away', 'foul', { pid: 'p-str-2', name: 'Bharat Singh', statKey: 'fouls', minute: 55 }),
  fbStat(21, 'home', 'corner', { minute: 57 }),
  { seq: 22, type: 'POSSESSION', side: null, payload: { side: 'away', at: nowMs - 22 * 60000 } },
  fbStat(23, 'away', 'shot', { onTarget: false, pid: 'p-bpl-sameer', name: 'Sameer Khan', statKey: 'shots', minute: 61 }),
  { seq: 24, type: 'YELLOW', side: 'home', payload: { minute: 63 }, attribution: { playerId: 'p-bpl-aditya', stat: 'yellowCards', by: 1, playerName: 'Aditya Shetty' } },
  fbStat(25, 'away', 'corner', { minute: 66 }),
  fbStat(26, 'home', 'foul', { pid: 'p-fal-3', name: 'Dinesh Kamath', statKey: 'fouls', minute: 68 }),
  { seq: 27, type: 'YELLOW', side: 'away', payload: { minute: 70 }, attribution: { playerId: 'p-bpl-sameer', stat: 'yellowCards', by: 1, playerName: 'Sameer Khan' } },
  { seq: 28, type: 'POSSESSION', side: null, payload: { side: 'home', at: nowMs - 10 * 60000 } },
  fbStat(29, 'home', 'shot', { onTarget: true, pid: 'p-bpl-rahul', name: 'Rahul Menon', statKey: 'shots', minute: 74 }),
  fbStat(30, 'away', 'offside', { minute: 76 }),
  fbStat(31, 'away', 'shot', { onTarget: false, pid: 'p-str-2', name: 'Bharat Singh', statKey: 'shots', minute: 78 }),
];

// England vs Croatia — the real World Cup first half (2–2 at HT), seeded so the
// scorer continues live in the 2nd half. Kane pen (12'), Baturina (36'),
// Kane header from Rice's corner (42'), Musa (45+'). 2nd half just kicked off.
const wcGoal = (
  seq: number, side: 'home' | 'away', minute: number, goalType: 'open' | 'penalty' | 'freekick' | 'header', pid: string, name: string
): MatchEventRecord => ({
  seq, type: 'GOAL', side, payload: { minute, goalType },
  attribution: { playerId: pid, stat: 'goals', by: 1, playerName: name, extra: { shots: 1, shotsOnTarget: 1, [goalType === 'penalty' ? 'penaltyGoals' : goalType === 'freekick' ? 'freekickGoals' : 'openPlayGoals']: 1 } },
});
// Seeded end-to-end (shots, corners, fouls, cards, offsides + possession swings)
// so the flagship WC tie's Stats/Timeline are full, not just the goals. Possession
// splits ≈ 54–46 via the POSSESSION events (fouls omit possSide — see kc3 note).
demo.matchEvents['m-eng-cro'] = [
  { seq: 1, type: 'KICKOFF', side: null, payload: { at: nowMs - 90 * 60000, possSide: 'home' } },
  fbStat(2, 'home', 'shot', { onTarget: true, pid: 'p-eng-10', name: 'Noni Madueke', statKey: 'shots', minute: 5 }),
  fbStat(3, 'away', 'shot', { onTarget: false, pid: 'p-cro-10', name: 'Mario Pašalić', statKey: 'shots', minute: 8 }),
  { seq: 4, type: 'POSSESSION', side: null, payload: { side: 'away', at: nowMs - 82 * 60000 } },
  fbStat(5, 'away', 'corner', { minute: 10 }),
  wcGoal(6, 'home', 12, 'penalty', 'p-eng-11', 'Harry Kane'),
  fbStat(7, 'home', 'shot', { onTarget: false, pid: 'p-eng-8', name: 'Anthony Gordon', statKey: 'shots', minute: 16 }),
  fbStat(8, 'home', 'foul', { minute: 18 }),
  { seq: 9, type: 'POSSESSION', side: null, payload: { side: 'home', at: nowMs - 68 * 60000 } },
  fbStat(10, 'away', 'shot', { onTarget: true, pid: 'p-cro-6', name: 'Luka Modrić', statKey: 'shots', minute: 22 }),
  fbStat(11, 'away', 'foul', { minute: 25 }),
  fbStat(12, 'home', 'corner', { minute: 28 }),
  fbStat(13, 'away', 'shot', { onTarget: false, pid: 'p-cro-5', name: 'Ivan Perišić', statKey: 'shots', minute: 32 }),
  { seq: 14, type: 'POSSESSION', side: null, payload: { side: 'away', at: nowMs - 55 * 60000 } },
  wcGoal(15, 'away', 36, 'open', 'p-cro-9', 'Martin Baturina'),
  fbStat(16, 'home', 'offside', { minute: 38 }),
  fbStat(17, 'home', 'shot', { onTarget: true, pid: 'p-eng-9', name: 'Jude Bellingham', statKey: 'shots', minute: 40 }),
  wcGoal(18, 'home', 42, 'header', 'p-eng-11', 'Harry Kane'),
  { seq: 19, type: 'ASSIST', side: 'home', payload: { minute: 42 }, attribution: { playerId: 'p-eng-6', stat: 'assists', by: 1, playerName: 'Declan Rice' } },
  fbStat(20, 'home', 'corner', { minute: 44 }),
  wcGoal(21, 'away', 45, 'open', 'p-cro-11', 'Petar Musa'),
  { seq: 22, type: 'ASSIST', side: 'away', payload: { minute: 45 }, attribution: { playerId: 'p-cro-5', stat: 'assists', by: 1, playerName: 'Ivan Perišić' } },
  { seq: 23, type: 'NEXT_HALF', side: null, payload: { at: nowMs - 45 * 60000 } },
  // 2nd half kicked off ~33 min ago → clock reads ~78'. Bellingham put England 3–2 up.
  { seq: 24, type: 'KICKOFF', side: null, payload: { at: nowMs - 33 * 60000, possSide: 'home' } },
  wcGoal(25, 'home', 47, 'open', 'p-eng-9', 'Jude Bellingham'),
  fbStat(26, 'home', 'shot', { onTarget: false, pid: 'p-eng-11', name: 'Harry Kane', statKey: 'shots', minute: 50 }),
  fbStat(27, 'away', 'corner', { minute: 53 }),
  fbStat(28, 'away', 'foul', { pid: 'p-cro-6', name: 'Luka Modrić', statKey: 'fouls', minute: 54 }),
  { seq: 29, type: 'YELLOW', side: 'away', payload: { minute: 55 }, attribution: { playerId: 'p-cro-6', stat: 'yellowCards', by: 1, playerName: 'Luka Modrić' } },
  { seq: 30, type: 'POSSESSION', side: null, payload: { side: 'away', at: nowMs - 20 * 60000 } },
  fbStat(31, 'away', 'shot', { onTarget: true, pid: 'p-cro-11', name: 'Petar Musa', statKey: 'shots', minute: 58 }),
  fbStat(32, 'home', 'foul', { minute: 60 }),
  fbStat(33, 'away', 'offside', { minute: 62 }),
  fbStat(34, 'home', 'corner', { minute: 67 }),
  fbStat(35, 'home', 'foul', { pid: 'p-eng-6', name: 'Declan Rice', statKey: 'fouls', minute: 69 }),
  { seq: 36, type: 'YELLOW', side: 'home', payload: { minute: 70 }, attribution: { playerId: 'p-eng-6', stat: 'yellowCards', by: 1, playerName: 'Declan Rice' } },
  { seq: 37, type: 'POSSESSION', side: null, payload: { side: 'home', at: nowMs - 8 * 60000 } },
  fbStat(38, 'away', 'foul', { minute: 71 }),
  fbStat(39, 'away', 'shot', { onTarget: true, pid: 'p-cro-9', name: 'Martin Baturina', statKey: 'shots', minute: 74 }),
  { seq: 40, type: 'YELLOW', side: 'away', payload: { minute: 76 }, attribution: { playerId: 'p-cro-2', stat: 'yellowCards', by: 1, playerName: 'Joško Gvardiol' } },
];

// Brazil vs Norway (live, m-bra-nor) — ~12' in, Brazil 1–0 up (Vinícius, assist
// Raphinha) with a few chances each, so the match opens on a real early game.
demo.matchEvents['m-bra-nor'] = [
  { seq: 1, type: 'KICKOFF', side: null, payload: { at: nowMs - 12 * 60000, possSide: 'home' } },
  fbStat(2, 'home', 'shot', { onTarget: true, pid: 'p-bra-9', name: 'Vinícius Júnior', statKey: 'shots', minute: 4 }),
  fbStat(3, 'home', 'corner', { minute: 5 }),
  wcGoal(4, 'home', 7, 'open', 'p-bra-9', 'Vinícius Júnior'),
  { seq: 5, type: 'ASSIST', side: 'home', payload: { minute: 7 }, attribution: { playerId: 'p-bra-7', stat: 'assists', by: 1, playerName: 'Bruno Guimarães' } },
  { seq: 6, type: 'POSSESSION', side: null, payload: { side: 'away', at: nowMs - 8 * 60000 } },
  fbStat(7, 'away', 'shot', { onTarget: false, pid: 'p-nor-10', name: 'Erling Haaland', statKey: 'shots', minute: 9 }),
  fbStat(8, 'away', 'foul', { minute: 10 }),
  { seq: 9, type: 'POSSESSION', side: null, payload: { side: 'home', at: nowMs - 3 * 60000 } },
  fbStat(10, 'away', 'shot', { onTarget: true, pid: 'p-nor-11', name: 'Alexander Sørloth', statKey: 'shots', minute: 11 }),
  fbStat(11, 'home', 'shot', { onTarget: false, pid: 'p-bra-10', name: 'Matheus Cunha', statKey: 'shots', minute: 12 }),
];

// Portugal vs Spain (live, m-por-esp) — ~13' in, Portugal 1–0 (Ronaldo, assist
// Bruno Fernandes), end-to-end.
demo.matchEvents['m-por-esp'] = [
  { seq: 1, type: 'KICKOFF', side: null, payload: { at: nowMs - 13 * 60000, possSide: 'home' } },
  fbStat(2, 'away', 'shot', { onTarget: false, pid: 'p-esp-11', name: 'Lamine Yamal', statKey: 'shots', minute: 3 }),
  { seq: 3, type: 'POSSESSION', side: null, payload: { side: 'away', at: nowMs - 10 * 60000 } },
  fbStat(4, 'home', 'shot', { onTarget: true, pid: 'p-por-9', name: 'Bruno Fernandes', statKey: 'shots', minute: 6 }),
  fbStat(5, 'home', 'corner', { minute: 7 }),
  wcGoal(6, 'home', 9, 'open', 'p-por-11', 'Cristiano Ronaldo'),
  { seq: 7, type: 'ASSIST', side: 'home', payload: { minute: 9 }, attribution: { playerId: 'p-por-9', stat: 'assists', by: 1, playerName: 'Bruno Fernandes' } },
  { seq: 8, type: 'POSSESSION', side: null, payload: { side: 'home', at: nowMs - 4 * 60000 } },
  fbStat(9, 'away', 'shot', { onTarget: true, pid: 'p-esp-10', name: 'Mikel Oyarzabal', statKey: 'shots', minute: 11 }),
  fbStat(10, 'home', 'foul', { minute: 12 }),
];

// Argentina vs Egypt (live, m-arg-egy) — ~14' in, 1–1: Messi opens (assist
// Álvarez), Salah equalises (assist Marmoush). End-to-end opening.
demo.matchEvents['m-arg-egy'] = [
  { seq: 1, type: 'KICKOFF', side: null, payload: { at: nowMs - 14 * 60000, possSide: 'home' } },
  fbStat(2, 'home', 'shot', { onTarget: true, pid: 'p-arg-11', name: 'Lionel Messi', statKey: 'shots', minute: 4 }),
  fbStat(3, 'home', 'corner', { minute: 6 }),
  wcGoal(4, 'home', 8, 'open', 'p-arg-11', 'Lionel Messi'),
  { seq: 5, type: 'ASSIST', side: 'home', payload: { minute: 8 }, attribution: { playerId: 'p-arg-10', stat: 'assists', by: 1, playerName: 'Julián Álvarez' } },
  { seq: 6, type: 'POSSESSION', side: null, payload: { side: 'away', at: nowMs - 10 * 60000 } },
  fbStat(7, 'away', 'shot', { onTarget: true, pid: 'p-egy-10', name: 'Mohamed Salah', statKey: 'shots', minute: 10 }),
  fbStat(8, 'home', 'foul', { minute: 11 }),
  wcGoal(9, 'away', 12, 'open', 'p-egy-10', 'Mohamed Salah'),
  { seq: 10, type: 'ASSIST', side: 'away', payload: { minute: 12 }, attribution: { playerId: 'p-egy-9', stat: 'assists', by: 1, playerName: 'Emam Ashour' } },
  { seq: 11, type: 'POSSESSION', side: null, payload: { side: 'home', at: nowMs - 6 * 60000 } },
  { seq: 12, type: 'POSSESSION', side: null, payload: { side: 'away', at: nowMs - 2 * 60000 } },
  fbStat(13, 'home', 'shot', { onTarget: false, pid: 'p-arg-10', name: 'Julián Álvarez', statKey: 'shots', minute: 13 }),
];

export function setTeamLeaders(teamId: string, leaders: TeamLeadership) {
  demo.teamLeaders[teamId] = leaders;
}

export function setOrgMembers(orgId: string, members: Organization['members']) {
  const o = demo.organizations.find((x) => x.id === orgId);
  if (o) o.members = members;
}

export function addOrganization(o: Omit<Organization, 'id'>): Organization {
  const created: Organization = { ...o, id: genId('org') };
  demo.organizations.unshift(created);
  return created;
}

export function addListing(l: Omit<Listing, 'id'>): Listing {
  const created: Listing = { ...l, id: genId('lst') };
  demo.listings.unshift(created);
  return created;
}

export function removeListing(id: string) {
  demo.listings = demo.listings.filter((l) => l.id !== id);
}

export function setLineup(matchId: string, lineup: MatchLineup) {
  demo.lineups[matchId] = lineup;
}

export function setFootballProfile(playerId: string, profile: FootballProfile) {
  demo.footballProfiles[playerId] = profile;
}

export function appendDemoMatchEvent(matchId: string, rec: MatchEventRecord) {
  (demo.matchEvents[matchId] ??= []).push(rec);
}

/** Remove & return the most recent event for a match (undo). */
export function popDemoMatchEvent(matchId: string): MatchEventRecord | null {
  const arr = demo.matchEvents[matchId];
  return arr && arr.length ? arr.pop() ?? null : null;
}

const blankSquads = (): MatchSquads => ({ home: { starters: [], subs: [] }, away: { starters: [], subs: [] } });
export function setDemoMatchSquad(matchId: string, side: 'home' | 'away', squad: MatchSquad) {
  const s = demo.matchSquads[matchId] ?? blankSquads();
  demo.matchSquads[matchId] = { ...s, [side]: squad };
}

let inviteSeq = 1000;
export const nextInviteToken = () => `JOIN-${++inviteSeq}`;
export function addDemoInvite(invite: TeamInvite) {
  demo.invites[invite.token] = invite;
}
export function addDemoCaptainTeam(teamId: string) {
  demo.captainTeams.add(teamId);
}

export function addTournament(t: Omit<Tournament, 'id'>): Tournament {
  const created: Tournament = { ...t, id: genId('t') };
  demo.tournaments.unshift(created);
  return created;
}

export function addTeam(t: Omit<Team, 'id'>): Team {
  const created: Team = { ...t, id: genId('tm') };
  demo.teams.push(created);
  return created;
}

export function addMatch(m: Omit<Match, 'id'>): Match {
  const created: Match = { ...m, id: genId('m') };
  demo.matches.push(created);
  return created;
}

export function addPlayer(p: Omit<Player, 'id'>): Player {
  const created: Player = { ...p, id: genId('p') };
  demo.players.push(created);
  return created;
}

/** Increment a player's stat for a match, creating the stat line if needed. */
export function recordStat(args: {
  matchId: string;
  playerId: string;
  sport: StatLine['sport'];
  stat: string;
  by: number;
  opponent?: string;
  date?: string;
  tracked?: string[];
}): void {
  let lineForMatch = demo.statLines.find(
    (l) => l.matchId === args.matchId && l.playerId === args.playerId && l.sport === args.sport
  );
  if (!lineForMatch) {
    lineForMatch = {
      id: `sl-${sl++}`,
      matchId: args.matchId,
      playerId: args.playerId,
      sport: args.sport,
      stats: {},
      won: false,
      opponent: args.opponent,
      date: args.date,
    };
    demo.statLines.push(lineForMatch);
  }
  lineForMatch.stats[args.stat] = (lineForMatch.stats[args.stat] ?? 0) + args.by;
  if (args.tracked) lineForMatch.tracked = args.tracked;
}
