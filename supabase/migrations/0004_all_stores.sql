-- 0004_all_stores.sql — hent ALLE aktive butikker (hele Norge), ikke bare de nærmeste.
-- Kartet skal kunne vise alt; avstand regnes ut på klienten ut fra brukerens posisjon.
create or replace function public.all_stores()
returns table (
  id uuid, name text, brand text, chain text, shop_type text,
  latitude double precision, longitude double precision,
  opening_hours text, opening_hours_valid boolean, phone text, website text, offer_count integer
) language sql stable as $$
  select
    pl.id, pl.name, pl.brand, pl.chain, pl.shop_type, pl.latitude, pl.longitude,
    pl.opening_hours, pl.opening_hours_valid, pl.phone, pl.website,
    coalesce((select count(*) from public.offers o
      where (o.store_id = pl.id or (o.store_id is null and o.chain_id = pl.chain_id))
        and (o.valid_to is null or o.valid_to >= current_date)
        and (o.valid_from is null or o.valid_from <= current_date)), 0)::int as offer_count
  from public.places pl
  where pl.is_active;
$$;
grant execute on function public.all_stores() to anon, authenticated;
