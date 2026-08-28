-- Multi-sport medal scoring — a tournament-wide config for meets where each
-- sport awards points by finishing position (Olympics / inter-school style) and
-- those points sum into one overall table.
--
--   scoring = {
--     "mode": "position",              -- 'match' | 'position'
--     "positionPoints": [10,7,5,4,3,2,1],
--     "sportWeights": { "football": 2 }
--   }
--
-- Walkovers ride on the existing matches.format jsonb (__walkover flag), so no
-- column is needed for them.

alter table tournaments add column if not exists scoring jsonb;
