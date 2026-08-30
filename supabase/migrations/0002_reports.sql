-- 0002_reports.sql — brukerrapporter om feil åpningstid (uten konto)

create table if not exists public.opening_hours_reports (
  id                     uuid primary key default gen_random_uuid(),
  place_id               uuid not null references public.places(id) on delete cascade,
  report_type            text not null check (report_type in
                           ('open_but_shown_closed','closed_but_shown_open',
                            'wrong_hours','permanently_closed','other')),
  reported_opening_hours text,
  comment                text,
  status                 text not null default 'pending' check (status in ('pending','accepted','rejected')),
  created_at             timestamptz not null default now(),
  reviewed_at            timestamptz
);
create index if not exists ohr_place_idx   on public.opening_hours_reports(place_id);
create index if not exists ohr_status_idx  on public.opening_hours_reports(status);
create index if not exists ohr_created_idx on public.opening_hours_reports(created_at);

-- RLS på, INGEN anon-policy => direkte tabelltilgang nektet.
-- Innsending skjer kun via RPC-en under (SECURITY DEFINER). Gjennomgang gjøres i Supabase.
alter table public.opening_hours_reports enable row level security;

create or replace function public.report_opening_hours(
  p_place_id uuid,
  p_type     text,
  p_hours    text default null,
  p_comment  text default null
) returns text
language plpgsql security definer set search_path = public as $$
declare recent int;
begin
  if p_type not in ('open_but_shown_closed','closed_but_shown_open','wrong_hours','permanently_closed','other') then
    raise exception 'ugyldig report_type';
  end if;
  if not exists (select 1 from places where id = p_place_id) then
    raise exception 'ukjent butikk';
  end if;

  -- Enkel flomvakt (uten konto): begrens per butikk og globalt.
  select count(*) into recent from opening_hours_reports
    where place_id = p_place_id and created_at > now() - interval '1 hour';
  if recent >= 15 then raise exception 'for mange rapporter for denne butikken akkurat nå'; end if;

  select count(*) into recent from opening_hours_reports
    where created_at > now() - interval '1 minute';
  if recent >= 60 then raise exception 'for mange rapporter akkurat nå, prøv igjen snart'; end if;

  insert into opening_hours_reports(place_id, report_type, reported_opening_hours, comment)
    values (p_place_id, p_type, nullif(trim(p_hours), ''), nullif(trim(p_comment), ''));
  return 'ok';
end $$;

grant execute on function public.report_opening_hours(uuid, text, text, text) to anon, authenticated;
