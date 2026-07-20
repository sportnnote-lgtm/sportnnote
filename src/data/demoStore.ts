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
import { emptyFormation } from '../sports/football/formation';
import type {
  FootballProfile,
  Listing,
  Match,
  MatchDispute,
  MatchEventRecord,
  Organization,
  MatchLineup,
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
  { id: 'p-rh-7', fullName: 'Rakesh Gowda', jerseyNo: 27, sports: ['kabaddi', 'volleyball', 'basketball'], houseName: 'Red House', houseColor: RED, city: 'Bengaluru' },
  { id: 'p-rh-8', fullName: 'Divya Menon', jerseyNo: 28, sports: ['tennis', 'badminton', 'basketball'], houseName: 'Red House', houseColor: RED, city: 'Bengaluru' },
  { id: 'p-rh-9', fullName: 'Harsha Bhat', jerseyNo: 29, sports: ['football', 'volleyball', 'kabaddi'], houseName: 'Red House', houseColor: RED, city: 'Bengaluru' },
  // Blue House depth
  { id: 'p-bh-1', fullName: 'Faisal Khan', jerseyNo: 20, sports: ['kabaddi', 'football', 'volleyball'], houseName: 'Blue House', houseColor: BLUE, city: 'Bengaluru' },
  { id: 'p-bh-2', fullName: 'Rohit Pillai', jerseyNo: 21, sports: ['kabaddi', 'basketball', 'volleyball'], houseName: 'Blue House', houseColor: BLUE, city: 'Bengaluru' },
  { id: 'p-bh-3', fullName: 'Sameer Das', jerseyNo: 22, sports: ['kabaddi', 'football', 'tennis'], houseName: 'Blue House', houseColor: BLUE, city: 'Bengaluru' },
  { id: 'p-bh-4', fullName: 'Nisha Rao', jerseyNo: 24, sports: ['volleyball', 'basketball', 'badminton'], houseName: 'Blue House', houseColor: BLUE, city: 'Bengaluru' },
  { id: 'p-bh-5', fullName: 'Aisha Begum', jerseyNo: 25, sports: ['badminton', 'tennis', 'volleyball'], houseName: 'Blue House', houseColor: BLUE, city: 'Bengaluru' },
  { id: 'p-bh-6', fullName: 'Karan Mehta', jerseyNo: 26, sports: ['kabaddi', 'basketball', 'football'], houseName: 'Blue House', houseColor: BLUE, city: 'Bengaluru' },
  { id: 'p-bh-7', fullName: 'Vivek Shenoy', jerseyNo: 27, sports: ['kabaddi', 'volleyball', 'tennis'], houseName: 'Blue House', houseColor: BLUE, city: 'Bengaluru' },
  { id: 'p-bh-8', fullName: 'Tina Dsa', jerseyNo: 28, sports: ['tennis', 'badminton', 'basketball'], houseName: 'Blue House', houseColor: BLUE, city: 'Bengaluru' },
  { id: 'p-bh-9', fullName: 'Aman Joshi', jerseyNo: 29, sports: ['football', 'volleyball', 'badminton'], houseName: 'Blue House', houseColor: BLUE, city: 'Bengaluru' },
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
  { id: 'p-tit-2', fullName: 'Arjun Pillai', jerseyNo: 4, sports: ['football'], houseName: 'Titan Athletic', houseColor: '#8E6FE0', city: 'Bengaluru' },
  { id: 'p-rov-2', fullName: 'Kunal Das', jerseyNo: 4, sports: ['football'], houseName: 'Rovers United', houseColor: '#27AE60', city: 'Bengaluru' },

  // ---- Bengaluru City Games (t6) — four multi-sport city clubs (football,
  // basketball, volleyball) so a non-house, cross-club league has real squads. ----
  { id: 'p-ind-1', fullName: 'Tej Anand', jerseyNo: 7, sports: ['football', 'basketball'], houseName: 'Indiranagar United', houseColor: '#F2994A', city: 'Bengaluru' },
  { id: 'p-ind-2', fullName: 'Rohan Bhatt', jerseyNo: 8, sports: ['football', 'volleyball'], houseName: 'Indiranagar United', houseColor: '#F2994A', city: 'Bengaluru' },
  { id: 'p-ind-3', fullName: 'Sahil Verma', jerseyNo: 9, sports: ['basketball', 'volleyball'], houseName: 'Indiranagar United', houseColor: '#F2994A', city: 'Bengaluru' },
  { id: 'p-ind-4', fullName: 'Nidhi Rao', jerseyNo: 10, sports: ['volleyball', 'basketball'], houseName: 'Indiranagar United', houseColor: '#F2994A', city: 'Bengaluru' },
  { id: 'p-ind-5', fullName: 'Akash Pillai', jerseyNo: 11, sports: ['football', 'basketball', 'volleyball'], houseName: 'Indiranagar United', houseColor: '#F2994A', city: 'Bengaluru' },
  { id: 'p-kor-1', fullName: 'Vinay Kumar', jerseyNo: 7, sports: ['football', 'basketball'], houseName: 'Koramangala Kings', houseColor: '#2F80ED', city: 'Bengaluru' },
  { id: 'p-kor-2', fullName: 'Deepak Nair', jerseyNo: 8, sports: ['football', 'volleyball'], houseName: 'Koramangala Kings', houseColor: '#2F80ED', city: 'Bengaluru' },
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
  line('p-eng-11', 'football', { goals: 2, openPlayGoals: 1, penaltyGoals: 1, shots: 2, shotsOnTarget: 2 }, false, 'Croatia', '2026-06-17', 'm-eng-cro', WC_TRACK),
  line('p-eng-9', 'football', { goals: 1, openPlayGoals: 1, shots: 1, shotsOnTarget: 1 }, false, 'Croatia', '2026-06-17', 'm-eng-cro', WC_TRACK), // Bellingham 47'
  line('p-eng-6', 'football', { assists: 1 }, false, 'Croatia', '2026-06-17', 'm-eng-cro', WC_TRACK),
  line('p-cro-9', 'football', { goals: 1, openPlayGoals: 1, shots: 1, shotsOnTarget: 1 }, false, 'England', '2026-06-17', 'm-eng-cro', WC_TRACK),
  line('p-cro-11', 'football', { goals: 1, openPlayGoals: 1, shots: 1, shotsOnTarget: 1 }, false, 'England', '2026-06-17', 'm-eng-cro', WC_TRACK),
  line('p-cro-5', 'football', { assists: 1 }, false, 'England', '2026-06-17', 'm-eng-cro', WC_TRACK), // Perišić assist on Musa

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

// Seed a lineup for the live football match (m1): Red home, Blue away.
function seedLineup(): MatchLineup {
  const home = emptyFormation();
  const away = emptyFormation();
  const put = (slots: typeof home, position: string, id: string, name: string) => {
    const slot = slots.find((s) => s.position === position && !s.playerId);
    if (slot) {
      slot.playerId = id;
      slot.playerName = name;
    }
  };
  // Red XI (one player, Harsha, kept on the bench so a sub can come on).
  put(home, 'GK', 'p-neil', 'Neil Kapoor');
  put(home, 'CB', 'p-rh-3', 'Nikhil Shetty');
  put(home, 'CB', 'p-rh-1', 'Kiran Rao');
  put(home, 'LB', 'p-rh-6', 'Varun Kamath');
  put(home, 'CM', 'p-rohan', 'Rohan Nair');
  put(home, 'ST', 'p-aarav', 'Aarav Mehta');
  // Blue XI (Aman kept on the bench).
  put(away, 'GK', 'p-maya', 'Maya Pillai');
  put(away, 'CB', 'p-ishaan', 'Ishaan Verma');
  put(away, 'CB', 'p-bh-6', 'Karan Mehta');
  put(away, 'LB', 'p-bh-1', 'Faisal Khan');
  put(away, 'CM', 'p-bh-3', 'Sameer Das');
  return { home, away };
}

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

export const demo = {
  tournaments: [...TOURNAMENTS, WC_TOURNAMENT].map((t) => ({ ...t })) as Tournament[],
  organizations: SEED_ORGS,
  matches: ALL_MATCHES.map((m) => ({ ...m })) as Match[],
  teams: deriveTeams(ALL_MATCHES),
  players: [...players, ...WC_PLAYERS, ...BN_PLAYERS, ...PE_PLAYERS, ...AE_PLAYERS],
  statLines,
  lineups: { m1: seedLineup(), 'm-eng-cro': WC_LINEUP, 'm-bra-nor': BN_LINEUP, 'm-por-esp': PE_LINEUP, 'm-arg-egy': AE_LINEUP } as Record<string, MatchLineup>,
  /** append-only scoring log per match — mirrors the Supabase match_events table */
  matchEvents: {} as Record<string, MatchEventRecord[]>,
  /** matchday squads (starting XI + subs) per match */
  matchSquads: { 'm-eng-cro': WC_SQUADS, 'm-bra-nor': BN_SQUADS, 'm-por-esp': PE_SQUADS, 'm-arg-egy': AE_SQUADS } as Record<string, MatchSquads>,
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
const DEMO_KEY = 'sportfolio.demo.v1';

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
const bbScore = (seq: number, side: 'home' | 'away', points: number, minute: number, pid: string, name: string): MatchEventRecord =>
  ({ seq, type: 'SCORE', side, payload: { points, minute, quarter: 1 }, attribution: { playerId: pid, stat: 'points', by: points, playerName: name } });
const fbStat = (seq: number, side: 'home' | 'away', kind: string, o: { onTarget?: boolean; pid?: string; name?: string; statKey?: string; at?: number; possSide?: 'home' | 'away' } = {}): MatchEventRecord =>
  ({ seq, type: 'STAT', side, payload: { kind, onTarget: o.onTarget, at: o.at, possSide: o.possSide, minute: 0 }, attribution: o.pid ? { playerId: o.pid, stat: o.statKey ?? `${kind}s`, by: 1, playerName: o.name } : null });
demo.matchEvents['m1'] = [
  { seq: 1, type: 'KICKOFF', side: null, payload: { at: nowMs - 32 * 60000, possSide: 'home' } },
  fbStat(2, 'home', 'shot', { onTarget: true, pid: 'p-aarav', name: 'Aarav Mehta', statKey: 'shots' }),
  { seq: 3, type: 'GOAL', side: 'home', payload: { minute: 12 }, attribution: { playerId: 'p-aarav', stat: 'goals', by: 1, playerName: 'Aarav Mehta' } },
  fbStat(4, 'home', 'shot', { onTarget: false, pid: 'p-rohan', name: 'Rohan Nair', statKey: 'shots' }),
  fbStat(5, 'home', 'corner'),
  { seq: 6, type: 'POSSESSION', side: null, payload: { side: 'away', at: nowMs - 22 * 60000 } },
  fbStat(7, 'away', 'shot', { onTarget: true, pid: 'p-ishaan', name: 'Ishaan Verma', statKey: 'shots' }),
  { seq: 8, type: 'GOAL', side: 'away', payload: { minute: 23 }, attribution: { playerId: 'p-ishaan', stat: 'goals', by: 1, playerName: 'Ishaan Verma' } },
  fbStat(9, 'home', 'foul', { pid: 'p-neil', name: 'Neil Kapoor', statKey: 'fouls', possSide: 'away' }),
  { seq: 10, type: 'POSSESSION', side: null, payload: { side: 'home', at: nowMs - 12 * 60000 } },
  fbStat(11, 'home', 'shot', { onTarget: false, pid: 'p-neil', name: 'Neil Kapoor', statKey: 'shots' }),
  { seq: 12, type: 'GOAL', side: 'home', payload: { minute: 33 }, attribution: { playerId: 'p-rohan', stat: 'goals', by: 1, playerName: 'Rohan Nair' } },
  fbStat(13, 'away', 'offside'),
  { seq: 14, type: 'YELLOW', side: 'home', payload: { minute: 20 }, attribution: { playerId: 'p-rohan', stat: 'yellowCards', by: 1, playerName: 'Rohan Nair' } },
  { seq: 15, type: 'YELLOW', side: 'away', payload: { minute: 26 }, attribution: { playerId: 'p-ishaan', stat: 'yellowCards', by: 1, playerName: 'Ishaan Verma' } },
  { seq: 16, type: 'SUB', side: 'home', payload: { minute: 30, offName: 'Varun Kamath', onName: 'Harsha Bhat' }, attribution: null },
];
demo.matchEvents['cg7'] = [
  { seq: 1, type: 'KICKOFF', side: null, payload: { at: nowMs - 8 * 60000 } },
  bbScore(2, 'home', 3, 1, 'p-ind-1', 'Tej Anand'),
  bbScore(3, 'away', 3, 1, 'p-kor-1', 'Vinay Kumar'),
  bbScore(4, 'home', 3, 2, 'p-ind-5', 'Akash Pillai'),
  bbScore(5, 'away', 2, 3, 'p-kor-5', 'Rohit Gowda'),
  bbScore(6, 'home', 2, 4, 'p-ind-3', 'Sahil Verma'),
  bbScore(7, 'away', 2, 4, 'p-kor-3', 'Manoj Pai'),
  bbScore(8, 'home', 2, 5, 'p-ind-1', 'Tej Anand'),
  bbScore(9, 'away', 2, 6, 'p-kor-1', 'Vinay Kumar'),
  bbScore(10, 'home', 2, 6, 'p-ind-5', 'Akash Pillai'),
  bbScore(11, 'away', 2, 7, 'p-kor-5', 'Rohit Gowda'),
  bbScore(12, 'home', 2, 7, 'p-ind-3', 'Sahil Verma'),
];
// Cup final (t7): a knockout tie level 1–1 in the 2nd half — ending it goes to
// a penalty shootout.
demo.matchEvents['kc3'] = [
  { seq: 1, type: 'KICKOFF', side: null, payload: { at: nowMs - 80 * 60000 } },
  { seq: 2, type: 'GOAL', side: 'home', payload: { minute: 18 }, attribution: { playerId: 'p-bpl-rahul', stat: 'goals', by: 1, playerName: 'Rahul Menon' } },
  { seq: 3, type: 'GOAL', side: 'away', payload: { minute: 37 }, attribution: { playerId: 'p-bpl-sameer', stat: 'goals', by: 1, playerName: 'Sameer Khan' } },
  { seq: 4, type: 'NEXT_HALF' },
  { seq: 5, type: 'KICKOFF', side: null, payload: { at: nowMs - 35 * 60000 } },
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
demo.matchEvents['m-eng-cro'] = [
  { seq: 1, type: 'KICKOFF', side: null, payload: { at: nowMs - 90 * 60000, possSide: 'home' } },
  wcGoal(2, 'home', 12, 'penalty', 'p-eng-11', 'Harry Kane'),
  wcGoal(3, 'away', 36, 'open', 'p-cro-9', 'Martin Baturina'),
  wcGoal(4, 'home', 42, 'header', 'p-eng-11', 'Harry Kane'),
  { seq: 5, type: 'ASSIST', side: 'home', payload: { minute: 42 }, attribution: { playerId: 'p-eng-6', stat: 'assists', by: 1, playerName: 'Declan Rice' } },
  wcGoal(6, 'away', 45, 'open', 'p-cro-11', 'Petar Musa'),
  { seq: 7, type: 'ASSIST', side: 'away', payload: { minute: 45 }, attribution: { playerId: 'p-cro-5', stat: 'assists', by: 1, playerName: 'Ivan Perišić' } },
  { seq: 8, type: 'NEXT_HALF' },
  // 2nd half kicked off ~33 min ago → clock reads ~78'. Bellingham put England 3–2 up.
  { seq: 9, type: 'KICKOFF', side: null, payload: { at: nowMs - 33 * 60000, possSide: 'home' } },
  wcGoal(10, 'home', 47, 'open', 'p-eng-9', 'Jude Bellingham'),
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
