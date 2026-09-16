-- מכירות מנות לפי יום — להזין כמה נמכר מכל מנה בתאריך, ולסכם שבוע / חודש.
-- quantity = מספר מנות שנמכרו באותו יום. 0 = אין מכירות (השורה נמחקת מהקליינט).

create table if not exists public.menu_dish_sales (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  dish_id     uuid not null references public.menu_dishes(id) on delete cascade,
  sold_on     date not null,
  quantity    numeric(12,2) not null check (quantity > 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint menu_dish_sales_unique unique (dish_id, sold_on)
);

create index if not exists idx_menu_dish_sales_business_date
  on public.menu_dish_sales (business_id, sold_on);
create index if not exists idx_menu_dish_sales_dish
  on public.menu_dish_sales (dish_id, sold_on);

comment on table public.menu_dish_sales is
  'כמה מנות נמכרו מכל מנה בכל יום. שבוע וחודש הם סיכום של הימים.';

drop trigger if exists trg_menu_dish_sales_updated on public.menu_dish_sales;
create trigger trg_menu_dish_sales_updated
  before update on public.menu_dish_sales
  for each row execute function public.set_updated_at();

alter table public.menu_dish_sales enable row level security;

drop policy if exists "menu_sales_manage" on public.menu_dish_sales;
create policy "menu_sales_manage" on public.menu_dish_sales
  for all using (public.can_manage_menu(business_id)) with check (public.can_manage_menu(business_id));

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

      ('menu',          'menu_dish_sales',              null),
      ('menu',          'menu_dish_components',         null),
      ('menu',          'menu_item_conversions',        null),
      ('menu',          'menu_dishes',                  null),
      ('menu',          'menu_categories',              null),
      ('menu',          'menu_settings',                null),

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
        'menu_dish_sales', 'menu_dish_components', 'menu_item_conversions', 'menu_dishes', 'menu_categories', 'menu_settings',
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
