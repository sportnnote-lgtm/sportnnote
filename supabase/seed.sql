-- ============================================================================
--  Seed data for a demo school sports meet. Run AFTER schema.sql.
--  Mirrors src/core/mockData.ts so the connected app looks like the demo.
--  (Run in the SQL editor as service role — bypasses RLS.)
--  NB: all ids are valid hex UUIDs (0-9, a-f only).
-- ============================================================================

insert into schools (id, name) values
  ('00000000-0000-0000-0000-000000000001', 'Greenwood High School')
on conflict (id) do nothing;

insert into venues (id, name, location) values
  ('00000000-0000-0000-0000-0000000000a1', 'Main Ground', 'Greenwood Campus'),
  ('00000000-0000-0000-0000-0000000000a2', 'Indoor Court A', 'Sports Block'),
  ('00000000-0000-0000-0000-0000000000a3', 'Athletics Track', 'North Field')
on conflict (id) do nothing;

insert into tournaments (id, name, host_name, sports, start_date, end_date) values
  ('00000000-0000-0000-0000-0000000000c1', 'Annual Sports Meet 2026', 'Greenwood High School',
   array['football','cricket','basketball','badminton','tennis','volleyball','kabaddi'],
   '2026-06-15', '2026-06-20')
on conflict (id) do nothing;

-- Houses fielded across sports. The `sport` column scopes a team to a sport.
insert into teams (id, name, short_name, sport, color_hex, school_id) values
  ('00000000-0000-0000-0000-0000000000f1', 'Red House',   'RED', 'football',   '#FF5C5C', '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-0000000000f2', 'Blue House',  'BLU', 'football',   '#4DA3FF', '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-0000000000b1', 'Green House', 'GRN', 'basketball', '#3DDC97', '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-0000000000b2', 'Gold House',  'GLD', 'basketball', '#FFB454', '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-0000000000d1', 'Red House',   'RED', 'badminton',  '#FF5C5C', '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-0000000000d2', 'Green House', 'GRN', 'badminton',  '#3DDC97', '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-0000000000e1', 'Blue House',  'BLU', 'kabaddi',    '#4DA3FF', '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-0000000000e2', 'Gold House',  'GLD', 'kabaddi',    '#FFB454', '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-0000000000aa', 'Green House', 'GRN', 'volleyball', '#3DDC97', '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-0000000000ab', 'Red House',   'RED', 'volleyball', '#FF5C5C', '00000000-0000-0000-0000-000000000001')
on conflict (id) do nothing;

insert into matches (id, tournament_id, sport, status, starts_at, venue_id, home_team_id, away_team_id, state) values
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000c1', 'football',  'live',      '2026-06-15T09:00:00Z', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f2', '{}'),
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000c1', 'basketball','scheduled', '2026-06-15T11:00:00Z', '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b2', '{}'),
  ('00000000-0000-0000-0000-0000000000c4', '00000000-0000-0000-0000-0000000000c1', 'badminton', 'scheduled', '2026-06-16T10:00:00Z', '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d2', '{}'),
  ('00000000-0000-0000-0000-0000000000c5', '00000000-0000-0000-0000-0000000000c1', 'kabaddi',   'scheduled', '2026-06-16T16:00:00Z', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e2', '{}'),
  ('00000000-0000-0000-0000-0000000000c6', '00000000-0000-0000-0000-0000000000c1', 'volleyball','completed', '2026-06-14T15:00:00Z', '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000aa', '00000000-0000-0000-0000-0000000000ab', '{}')
on conflict (id) do nothing;

-- Players and their per-match stat lines (feed profiles & Discover).
insert into players (id, full_name, jersey_no, sports, house_name, house_color, city, school_id) values
  ('00000000-0000-0000-0000-000000000011', 'Aarav Mehta',  10, array['football','cricket','basketball','badminton','tennis'], 'Red House',   '#FF5C5C', 'Bengaluru', '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000012', 'Diya Rao',      7, array['badminton','volleyball','basketball'],        'Green House', '#3DDC97', 'Bengaluru', '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000013', 'Kabir Singh',  23, array['basketball'],                                 'Gold House',  '#FFB454', 'Bengaluru', '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000014', 'Ishaan Verma',  4, array['football','cricket','kabaddi','tennis'],      'Blue House',  '#4DA3FF', 'Bengaluru', '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000015', 'Ananya Iyer',   9, array['volleyball','basketball'],                    'Green House', '#3DDC97', 'Bengaluru', '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000016', 'Rohan Nair',   11, array['football','cricket','volleyball'],            'Red House',   '#FF5C5C', 'Bengaluru', '00000000-0000-0000-0000-000000000001')
on conflict (id) do nothing;

insert into stat_lines (id, player_id, sport, stats, won, opponent, recorded_at) values
  ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000011', 'football',  '{"goals":2,"assists":1}', true,  'Blue House',  '2026-06-15'),
  ('00000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000011', 'football',  '{"goals":1,"assists":0}', false, 'Green House', '2026-06-12'),
  ('00000000-0000-0000-0000-000000000203', '00000000-0000-0000-0000-000000000011', 'basketball','{"points":14,"rebounds":5}', true, 'Gold House', '2026-06-12'),
  ('00000000-0000-0000-0000-000000000204', '00000000-0000-0000-0000-000000000011', 'badminton', '{"points":42,"games":2}', true,  'Green House', '2026-06-10'),
  ('00000000-0000-0000-0000-000000000205', '00000000-0000-0000-0000-000000000012', 'badminton', '{"points":63,"games":4}', true,  'Red House',   '2026-06-11'),
  ('00000000-0000-0000-0000-000000000206', '00000000-0000-0000-0000-000000000012', 'volleyball','{"points":18,"aces":4}', true,   'Red House',   '2026-06-14'),
  ('00000000-0000-0000-0000-000000000207', '00000000-0000-0000-0000-000000000013', 'basketball','{"points":22,"rebounds":8}', true, 'Green House','2026-06-13'),
  ('00000000-0000-0000-0000-000000000208', '00000000-0000-0000-0000-000000000013', 'basketball','{"points":14,"rebounds":6}', false,'Red House',  '2026-06-09'),
  ('00000000-0000-0000-0000-000000000209', '00000000-0000-0000-0000-000000000014', 'football',  '{"goals":1,"assists":2}', false, 'Red House',   '2026-06-15'),
  ('00000000-0000-0000-0000-00000000020a', '00000000-0000-0000-0000-000000000014', 'kabaddi',   '{"raidPoints":9,"tacklePoints":3}', true, 'Gold House', '2026-06-16'),
  ('00000000-0000-0000-0000-00000000020b', '00000000-0000-0000-0000-000000000015', 'volleyball','{"points":21,"aces":6}', true,   'Red House',   '2026-06-14'),
  ('00000000-0000-0000-0000-00000000020c', '00000000-0000-0000-0000-000000000011', 'cricket',   '{"runs":54,"wickets":0}', true,  'Blue House',  '2026-06-09'),
  ('00000000-0000-0000-0000-00000000020d', '00000000-0000-0000-0000-000000000016', 'football',  '{"goals":3,"assists":0}', true,  'Gold House',  '2026-06-13')
on conflict (id) do nothing;

-- Lineup for the live football match (c2): Red home, Blue away (partial demo).
insert into match_lineups (match_id, home, away) values (
  '00000000-0000-0000-0000-0000000000c2',
  '[{"position":"GK","x":0.5,"y":0.06},
    {"position":"CB","x":0.38,"y":0.24},
    {"position":"CB","x":0.62,"y":0.24},
    {"position":"CM","x":0.5,"y":0.48,"playerId":"00000000-0000-0000-0000-000000000016","playerName":"Rohan Nair"},
    {"position":"ST","x":0.5,"y":0.86,"playerId":"00000000-0000-0000-0000-000000000011","playerName":"Aarav Mehta"}]'::jsonb,
  '[{"position":"GK","x":0.5,"y":0.06},
    {"position":"CB","x":0.38,"y":0.24,"playerId":"00000000-0000-0000-0000-000000000014","playerName":"Ishaan Verma"},
    {"position":"ST","x":0.5,"y":0.86}]'::jsonb
) on conflict (match_id) do nothing;

insert into player_sport_profiles (player_id, sport, data) values (
  '00000000-0000-0000-0000-000000000011', 'football',
  '{"position":"ST","foot":"Right","teams":["Red House","City Juniors U16"],"bio":"Quick striker, strong finishing."}'::jsonb
) on conflict (player_id, sport) do nothing;
