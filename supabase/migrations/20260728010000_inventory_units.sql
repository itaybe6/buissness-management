-- Custom inventory units per business (manager-defined)

create table if not exists public.inventory_units (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name        text not null,
  sort_order  integer not null default 0,
  is_base     boolean not null default false,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create unique index if not exists idx_inv_units_business_name
  on public.inventory_units (business_id, lower(trim(name)));

create index if not exists idx_inv_units_business
  on public.inventory_units (business_id, sort_order, name);

comment on table public.inventory_units is 'יחידות מידה מותאמות לעסק — משמשות בקטלוג המלאi';
comment on column public.inventory_units.is_base is 'יחידת בסיס לספירה (למשל יחידות) — ללא פירוק ליחידים בודדים';

alter table public.inventory_units enable row level security;

create policy "inv_units_read" on public.inventory_units
  for select using (public.can_access(business_id));

create policy "inv_units_manager_write" on public.inventory_units
  for all using (
    public.can_access(business_id)
    and public.auth_role() in ('manager', 'shift_manager', 'office_manager')
  ) with check (
    public.can_access(business_id)
    and public.auth_role() in ('manager', 'shift_manager', 'office_manager')
  );

-- Seed default units for every business
insert into public.inventory_units (business_id, name, sort_order, is_base)
select b.id, u.name, u.sort_order, u.is_base
from public.businesses b
cross join (
  values
    ('יחידות', 0, true),
    ('ארגז', 1, false),
    ('ק״ג', 2, false),
    ('ליטר', 3, false)
) as u(name, sort_order, is_base)
where not exists (
  select 1
  from public.inventory_units iu
  where iu.business_id = b.id
    and lower(trim(iu.name)) = lower(trim(u.name))
);

-- Import any unit strings already used on products
insert into public.inventory_units (business_id, name, sort_order, is_base)
select distinct i.business_id, trim(i.unit), 100, false
from public.inventory_items i
where i.unit is not null
  and trim(i.unit) <> ''
  and not exists (
    select 1
    from public.inventory_units u
    where u.business_id = i.business_id
      and lower(trim(u.name)) = lower(trim(i.unit))
  );
