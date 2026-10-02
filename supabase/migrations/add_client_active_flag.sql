-- Adds a proper archive flag for clients instead of per-slug hardcoded query filters
-- (a prior attempt to hide FlavCity via .neq('slug', ...) filters was never merged and silently didn't work).
alter table clients add column if not exists active boolean not null default true;

update clients set active = false where slug in ('joolies', 'momofuku', 'facetub');
