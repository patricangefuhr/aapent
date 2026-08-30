-- 0005_stores_in_view.sql — hent butikker innenfor kartets synlige område (bounding box).
-- Viewport-basert: appen laster kun det som er i visning, og oppdaterer når kartet flyttes.
create or replace function public.stores_in_view(
  west double precision, south double precision, east double precision, north double precision,
  max_rows integer default 1000
) returns table (
  id uuid, name text, brand text, chain text, shop_type text,
  latitude double precision, longitude double precision,
  opening_hours text, opening_hours_valid boolean, phone text, website text, offer_count integer
) language sql stable as $$
  with env as (select ST_MakeEnvelope(west, south, east, north, 4326)::geography as g)
  select
    pl.id, pl.name, pl.brand, pl.chain, pl.shop_type, pl.latitude, pl.longitude,
    pl.opening_hours, pl.opening_hours_valid, pl.phone, pl.website,
    coalesce((select count(*) from public.offers o
      where (o.store_id = pl.id or (o.store_id is null and o.chain_id = pl.chain_id))
        and (o.valid_to is null or o.valid_to >= current_date)
        and (o.valid_from is null or o.valid_from <= current_date)), 0)::int as offer_count
  from public.places pl, env
  where pl.is_active and pl.geog && env.g
  limit greatest(1, least(max_rows, 2000));
$$;
grant execute on function public.stores_in_view(double precision, double precision, double precision, double precision, integer) to anon, authenticated;
