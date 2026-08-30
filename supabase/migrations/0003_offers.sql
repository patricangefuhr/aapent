-- 0003_offers.sql — kjeder + tilbud/kundeaviser

-- ── chains: kanonisk kjede (så nasjonale tilbud kobles én gang, ikke per butikk) ──
create table if not exists public.chains (
  id           bigint generated always as identity primary key,
  canonical    text not null unique,   -- matcher places.chain
  display_name text not null,
  is_grocery   boolean not null default true
);
insert into public.chains (canonical, display_name) values
  ('KIWI','KIWI'),('REMA 1000','REMA 1000'),('MENY','MENY'),
  ('Coop Extra','Coop Extra'),('Coop Prix','Coop Prix'),('Coop Mega','Coop Mega'),
  ('Coop Marked','Coop Marked'),('Coop Obs','Obs'),('Coop','Coop'),
  ('Joker','Joker'),('SPAR','SPAR'),('EUROSPAR','EUROSPAR'),
  ('Bunnpris','Bunnpris'),('Nærbutikken','Nærbutikken'),('Matkroken','Matkroken')
on conflict (canonical) do nothing;

-- ── knytt places til chains ──
alter table public.places add column if not exists chain_id bigint references public.chains(id);
update public.places p set chain_id = c.id
  from public.chains c where c.canonical = p.chain and p.chain_id is distinct from c.id;
create index if not exists places_chain_id_idx on public.places(chain_id);

-- ── offers ──
create table if not exists public.offers (
  id             uuid primary key default gen_random_uuid(),
  chain_id       bigint references public.chains(id),          -- nasjonalt/regionalt kjedetilbud
  store_id       uuid references public.places(id) on delete cascade, -- butikkspesifikt
  product_name   text not null,
  description    text,
  current_price  numeric(10,2),
  previous_price numeric(10,2),
  unit_price     text,                                          -- jamførpris, f.eks. "99,80 kr/kg"
  image_url      text,
  valid_from     date,
  valid_to       date,
  source_url     text,
  source         text not null,                                 -- adapter/kilde-navn
  scope          text not null default 'national' check (scope in ('national','regional','store')),
  imported_at    timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (chain_id is not null or store_id is not null)
);
create index if not exists offers_chain_idx   on public.offers(chain_id);
create index if not exists offers_store_idx   on public.offers(store_id);
create index if not exists offers_validto_idx on public.offers(valid_to);
-- idempotent import: samme produkt/kjede/periode/kilde skal ikke dupliseres
create unique index if not exists offers_dedup_uidx
  on public.offers(source, coalesce(chain_id,0), coalesce(store_id,'00000000-0000-0000-0000-000000000000'::uuid),
                   product_name, coalesce(valid_from,'1900-01-01'), coalesce(valid_to,'9999-12-31'));

alter table public.offers enable row level security;
drop policy if exists offers_read_valid on public.offers;
create policy offers_read_valid on public.offers for select to anon, authenticated
  using ((valid_to is null or valid_to >= current_date) and (valid_from is null or valid_from <= current_date));
grant select on public.offers to anon, authenticated;

-- ── store_offers: nasjonale (via kjede) + butikkspesifikke, gyldige i dag ──
create or replace function public.store_offers(p_store_id uuid)
returns setof public.offers language sql stable as $$
  select o.* from public.offers o
  join public.places pl on pl.id = p_store_id
  where (o.store_id = p_store_id or (o.store_id is null and o.chain_id = pl.chain_id))
    and (o.valid_to is null or o.valid_to >= current_date)
    and (o.valid_from is null or o.valid_from <= current_date)
  order by (o.store_id is not null) desc, o.current_price nulls last;
$$;
grant execute on function public.store_offers(uuid) to anon, authenticated;

-- ── nearby_stores: legg til offer_count (antall gyldige tilbud) ──
drop function if exists public.nearby_stores(double precision, double precision, integer);
create function public.nearby_stores(
  lat double precision, lon double precision, radius_m integer default 10000
) returns table (
  id uuid, name text, brand text, chain text, shop_type text,
  latitude double precision, longitude double precision, distance_m integer,
  opening_hours text, opening_hours_valid boolean, phone text, website text, offer_count integer
) language sql stable as $$
  with p as (select ST_SetSRID(ST_MakePoint(lon, lat), 4326)::geography as g)
  select
    pl.id, pl.name, pl.brand, pl.chain, pl.shop_type, pl.latitude, pl.longitude,
    round(ST_Distance(pl.geog, p.g))::int as distance_m,
    pl.opening_hours, pl.opening_hours_valid, pl.phone, pl.website,
    coalesce((select count(*) from public.offers o
      where (o.store_id = pl.id or (o.store_id is null and o.chain_id = pl.chain_id))
        and (o.valid_to is null or o.valid_to >= current_date)
        and (o.valid_from is null or o.valid_from <= current_date)), 0)::int as offer_count
  from public.places pl, p
  where pl.is_active and ST_DWithin(pl.geog, p.g, radius_m)
  order by pl.geog <-> p.g
  limit 500;
$$;
grant execute on function public.nearby_stores(double precision, double precision, integer) to anon, authenticated;
