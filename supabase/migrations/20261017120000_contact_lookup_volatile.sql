-- 0036 — Fix "Couldn't check that number" (add scorer / add host / Discover).
--
-- The contact lookups were declared STABLE, but each records a rate-limit hit
-- (an INSERT). PostgREST runs STABLE rpc calls in a READ ONLY transaction, so
-- every live call failed with "cannot execute INSERT in a read-only
-- transaction". They are lookups that write, so VOLATILE is correct.
alter function public.find_player_by_phone(text) volatile;
alter function public.find_player_by_email(text) volatile;
alter function public.discover_player_by_contact(text) volatile;
