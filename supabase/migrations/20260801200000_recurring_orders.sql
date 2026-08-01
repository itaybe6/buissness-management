-- הזמנות קבועות — תבנית מוצרים שממנה אפשר להתחיל הזמנה חדשה בלחיצה אחת

create table if not exists public.recurring_orders (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses(id) on delete cascade,
  name         text not null,
  notes        text,
  created_by   uuid references public.profiles(id),
  last_used_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.recurring_order_items (
  business_id        uuid not null references public.businesses(id) on delete cascade,
  recurring_order_id uuid not null references public.recurring_orders(id) on delete cascade,
  item_id            uuid not null references public.inventory_items(id) on delete cascade,
  supplier_id        uuid references public.suppliers(id) on delete set null,
  quantity           numeric(12,2) not null check (quantity > 0),
  created_at         timestamptz not null default now(),
  primary key (recurring_order_id, item_id)
);

comment on table public.recurring_orders is 'הזמנות קבועות — תבניות הזמנה שמורות לעסק';
comment on column public.recurring_orders.last_used_at is 'מתי לאחרונה נפתחה הזמנה מהתבנית הזו';
comment on table public.recurring_order_items is 'המוצרים בהזמנה קבועה — כמות וספק ברירת מחדל לכל מוצר';

create unique index if not exists idx_recurring_orders_business_name
  on public.recurring_orders (business_id, lower(trim(name)));
create index if not exists idx_recurring_orders_business
  on public.recurring_orders (business_id, created_at desc);
create index if not exists idx_recurring_order_items_business
  on public.recurring_order_items (business_id);
create index if not exists idx_recurring_order_items_item
  on public.recurring_order_items (item_id);

drop trigger if exists recurring_orders_updated_at on public.recurring_orders;
create trigger recurring_orders_updated_at
  before update on public.recurring_orders
  for each row execute function public.set_updated_at();

alter table public.recurring_orders enable row level security;
alter table public.recurring_order_items enable row level security;

drop policy if exists "recurring_orders_tenant" on public.recurring_orders;
create policy "recurring_orders_tenant" on public.recurring_orders
  for all using (public.can_access(business_id)) with check (public.can_access(business_id));

drop policy if exists "recurring_order_items_tenant" on public.recurring_order_items;
create policy "recurring_order_items_tenant" on public.recurring_order_items
  for all using (public.can_access(business_id)) with check (public.can_access(business_id));

-- רישום הטבלאות החדשות במפת מחיקת המודולים (כיבוי מודול המלאי מוחק גם אותן)
create or replace function public.feature_data_tables(p_feature text)
returns table (tbl text, filter text)
language sql
immutable
as $$
  select t.tbl, t.filter
  from (
    values
      ('attendance',    'attendance',                   null::text),

      ('shifts',        'shift_preferences',            null),
      ('shifts',        'shift_assignments',            null),

      ('tasks',         'tasks',                        null),
      ('tasks',         'task_templates',               null),

      ('payroll',       'payroll_month_adjustments',    null),
      ('payroll',       'payroll_records',              null),

      ('agreements',    'agreement_signatures',         null),
      ('agreements',    'employee_id_cards',            null),
      ('agreements',    'form_101',                     null),
      ('agreements',    'agreement_templates',          null),

      ('shift_reports', 'shift_bonuses',                null),
      ('shift_reports', 'tips',                         null),
      ('shift_reports', 'shift_reports',                null),

      ('inventory',     'inventory_logs',               null),
      ('inventory',     'inventory_counts',             null),
      ('inventory',     'inventory_orders',             null),
      ('inventory',     'recurring_order_items',        null),
      ('inventory',     'recurring_orders',             null),
      ('inventory',     'supplier_items',               null),
      ('inventory',     'inventory_item_departments',   null),
      ('inventory',     'inventory_items',              null),
      ('inventory',     'suppliers',                    null),
      ('inventory',     'inventory_categories',         null),
      ('inventory',     'inventory_units',              null),
      ('inventory',     'warehouses',                   null),

      ('waste',         'inventory_waste',              null),

      ('faults',        'faults',                       null),

      ('events',        'tasks',                        'event_id is not null'),
      ('events',        'event_ideas',                  null),
      ('events',        'events',                       null)
  ) as t(feature, tbl, filter)
  where t.feature = p_feature;
$$;

create or replace function public.feature_purge_rank(p_table text)
returns integer
language sql
immutable
as $$
  select coalesce(
    array_position(
      array[
        'agreement_signatures', 'employee_id_cards', 'form_101', 'agreement_templates',
        'shift_preferences', 'shift_assignments',
        'attendance',
        'shift_bonuses', 'tips', 'shift_reports',
        'payroll_month_adjustments', 'payroll_records',
        'inventory_waste', 'inventory_logs', 'inventory_counts', 'inventory_orders',
        'recurring_order_items', 'recurring_orders',
        'supplier_items', 'inventory_item_departments', 'inventory_items',
        'suppliers', 'inventory_categories', 'inventory_units', 'warehouses',
        'faults',
        'tasks', 'task_templates',
        'event_ideas', 'events'
      ]::text[],
      p_table
    ),
    999
  );
$$;
