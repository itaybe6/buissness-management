-- Default shift templates (morning/afternoon/evening/night) per business
-- Run once in Supabase Dashboard → SQL Editor if not applied via MCP migration

alter table public.shift_templates add column if not exists shift_key text;

create unique index if not exists idx_shift_templates_business_key
  on public.shift_templates (business_id, shift_key)
  where shift_key is not null;

create or replace function public.seed_default_shift_templates(p_business_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.shift_templates (business_id, shift_key, name, start_time, end_time, color, active, sort_order)
  select p_business_id, v.shift_key, v.name, v.start_time::time, v.end_time::time, v.color, v.active, v.sort_order
  from (values
    ('morning',   'בוקר',   '06:00', '14:00', '#eab308', true,  0),
    ('afternoon', 'צהריים', '11:00', '19:00', '#fdab3d', true,  1),
    ('evening',   'ערב',    '16:00', '23:30', '#7c3aed', true,  2),
    ('night',     'לילה',   '22:00', '06:00', '#2563eb', false, 3)
  ) as v(shift_key, name, start_time, end_time, color, active, sort_order)
  where not exists (
    select 1 from public.shift_templates st
    where st.business_id = p_business_id and st.shift_key = v.shift_key
  );
end;
$$;

-- Backfill existing businesses
do $$
declare r record;
begin
  for r in select id from public.businesses loop
    perform public.seed_default_shift_templates(r.id);
  end loop;
end $$;

create or replace function public.trg_business_seed_shifts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.seed_default_shift_templates(new.id);
  return new;
end;
$$;

drop trigger if exists trg_business_seed_shifts on public.businesses;
create trigger trg_business_seed_shifts
  after insert on public.businesses
  for each row execute function public.trg_business_seed_shifts();
