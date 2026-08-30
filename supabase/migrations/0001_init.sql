-- Søndagsåpent — MVP schema (Norge, kun dagligvare)
-- Kjør i Supabase. Idempotent der det er mulig.

create extension if not exists postgis;

-- ─────────────────────────────────────────────────────────────
-- places: én canonical matbutikk
-- ─────────────────────────────────────────────────────────────
create table if not exists public.places (
  id                   uuid primary key default gen_random_uuid(),
  osm_type             text not null check (osm_type in ('node','way','relation')),
  osm_id               bigint not null,
  name                 text,
  brand                text,
  operator             text,
  chain                text,                 -- kanonisk kjede (KIWI, REMA 1000, …); null = uavhengig
  shop_type            text not null,        -- supermarket | convenience
  category             text,                 -- supermarket | grocery_convenience | convenience_independent
  latitude             double precision not null,
  longitude            double precision not null,
  geog                 geography(Point,4326) not null,
  opening_hours        text,
  opening_hours_valid  boolean,              -- parsebar av opening_hours.js? null = ikke oh
  phone                text,
  website              text,
  confidence           real,                 -- klassifiseringssikkerhet 0..1
  is_active            boolean not null default true,
  source               text not null default 'osm',
  source_updated_at    timestamptz,          -- når kilden sist var kjent gyldig (import-tidspunkt for OSM)
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  -- idempotens: samme OSM-objekt = samme rad
  unique (osm_type, osm_id)
);

-- Spatial index (kjernen i nearby-søk)
create index if not exists places_geog_gix on public.places using gist (geog);
-- Vanlige filtre
create index if not exists places_active_idx on public.places (is_active);
create index if not exists places_chain_idx  on public.places (chain);

-- ─────────────────────────────────────────────────────────────
-- place_sources: provenance — én butikk kan ha data fra flere kilder senere
-- (lean nå; gjør fremtidig berikelse mulig uten schema-endring)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.place_sources (
  id             uuid primary key default gen_random_uuid(),
  place_id       uuid not null references public.places(id) on delete cascade,
  source         text not null,              -- osm | chain_official | website | manual | user_report
  source_ref     text,                       -- f.eks. 'node/12345'
  opening_hours  text,
  raw            jsonb,
  priority       int not null default 0,
  observed_at    timestamptz,
  imported_at    timestamptz not null default now(),
  unique (place_id, source, source_ref)
);
create index if not exists place_sources_place_idx on public.place_sources (place_id);

-- ─────────────────────────────────────────────────────────────
-- import_runs: sporbarhet per import
-- ─────────────────────────────────────────────────────────────
create table if not exists public.import_runs (
  id             bigint generated always as identity primary key,
  source         text not null,
  area           text not null default 'NO',
  started_at     timestamptz not null default now(),
  finished_at    timestamptz,
  n_found        int,
  n_inserted     int,
  n_updated      int,
  n_deactivated  int,
  n_dedup_dropped int,
  notes          text
);

-- ─────────────────────────────────────────────────────────────
-- updated_at-trigger
-- ─────────────────────────────────────────────────────────────
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists trg_places_touch on public.places;
create trigger trg_places_touch before update on public.places
  for each row execute function public.touch_updated_at();

-- ─────────────────────────────────────────────────────────────
-- nearby_stores(lat, lon, radius_m): PostGIS-søk sortert på avstand
-- Returnerer rå felter + avstand. Åpningsstatus beregnes i JS-laget
-- (opening_hours.js) — én kilde til sannhet for status.
-- ─────────────────────────────────────────────────────────────
create or replace function public.nearby_stores(
  lat double precision,
  lon double precision,
  radius_m integer default 10000
)
returns table (
  id uuid,
  name text,
  brand text,
  chain text,
  shop_type text,
  latitude double precision,
  longitude double precision,
  distance_m integer,
  opening_hours text,
  opening_hours_valid boolean,
  phone text,
  website text
)
language sql stable
as $$
  with p as (
    select ST_SetSRID(ST_MakePoint(lon, lat), 4326)::geography as g
  )
  select
    pl.id, pl.name, pl.brand, pl.chain, pl.shop_type,
    pl.latitude, pl.longitude,
    round(ST_Distance(pl.geog, p.g))::int as distance_m,
    pl.opening_hours, pl.opening_hours_valid, pl.phone, pl.website
  from public.places pl, p
  where pl.is_active
    and ST_DWithin(pl.geog, p.g, radius_m)
  order by pl.geog <-> p.g
  limit 500;
$$;

-- ─────────────────────────────────────────────────────────────
-- RLS: frontend (anon) får KUN lese aktive butikker. Skriving kun via service_role.
-- ─────────────────────────────────────────────────────────────
alter table public.places        enable row level security;
alter table public.place_sources enable row level security;
alter table public.import_runs   enable row level security;

drop policy if exists places_read_active on public.places;
create policy places_read_active on public.places
  for select to anon, authenticated
  using (is_active);

-- place_sources og import_runs: ingen anon-policy => ingen tilgang for klient.

grant usage on schema public to anon, authenticated;
grant select on public.places to anon, authenticated;
grant execute on function public.nearby_stores(double precision, double precision, integer) to anon, authenticated;
