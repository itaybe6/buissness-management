-- מחסנים לעסק + כמות מלאי לפי מחסן (inventory_counts.warehouse_id)

create table if not exists public.warehouses (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name        text not null,
  sort_order  integer not null default 0,
  is_default  boolean not null default false,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

comment on table public.warehouses is 'מחסנים של העסק — כל מוצר יכול להחזיק כמות נפרדת בכל מחסן';

create unique index if not exists idx_warehouses_business_name
  on public.warehouses (business_id, lower(trim(name)));

create unique index if not exists idx_warehouses_one_default
  on public.warehouses (business_id)
  where is_default = true;

create index if not exists idx_warehouses_business
  on public.warehouses (business_id, sort_order);

alter table public.warehouses enable row level security;

drop policy if exists "warehouses_read" on public.warehouses;
create policy "warehouses_read" on public.warehouses
  for select using (public.can_access(business_id));

drop policy if exists "warehouses_manager_write" on public.warehouses;
create policy "warehouses_manager_write" on public.warehouses
  for all using (
    public.can_access(business_id)
    and public.auth_role() in ('manager', 'shift_manager', 'office_manager')
  ) with check (
    public.can_access(business_id)
    and public.auth_role() in ('manager', 'shift_manager', 'office_manager')
  );

-- מחסן ברירת מחדל לכל עסק קיים
insert into public.warehouses (business_id, name, sort_order, is_default)
select b.id, 'מחסן ראשי', 0, true
from public.businesses b
where not exists (
  select 1 from public.warehouses w where w.business_id = b.id and w.is_default = true
);

alter table public.inventory_counts
  add column if not exists warehouse_id uuid references public.warehouses(id) on delete restrict;

-- שיוך ספירות קיימות למחסן ברירת המחדל
update public.inventory_counts c
set warehouse_id = w.id
from public.warehouses w
where c.warehouse_id is null
  and w.business_id = c.business_id
  and w.is_default = true;

-- ספירות יתומות (ללא מחסן ברירת מחדל) — יצירת מחסן ושיוך
insert into public.warehouses (business_id, name, sort_order, is_default)
select distinct c.business_id, 'מחסן ראשי', 0, true
from public.inventory_counts c
where c.warehouse_id is null
  and not exists (
    select 1 from public.warehouses w where w.business_id = c.business_id
  );

update public.inventory_counts c
set warehouse_id = w.id
from public.warehouses w
where c.warehouse_id is null
  and w.business_id = c.business_id
  and w.is_default = true;

alter table public.inventory_counts
  alter column warehouse_id set not null;

create index if not exists idx_inv_counts_item_warehouse
  on public.inventory_counts (business_id, item_id, warehouse_id, counted_at desc);

alter table public.inventory_logs
  add column if not exists warehouse_id uuid references public.warehouses(id) on delete set null;
