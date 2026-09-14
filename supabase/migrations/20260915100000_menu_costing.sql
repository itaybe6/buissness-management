-- ============================================================================
-- מודול תפריט ותמחור מנות (menu)
--
-- עץ מנה: מנה ← מרכיבים. מרכיב הוא מוצר מהמלאי (inventory_items) או הכנה
-- (מנה מסוג prep — רוטב, בצק, ציר) שבנויה בעצמה ממרכיבים. עלות המנה מחושבת
-- בזמן אמת מהמחירונים של הספקים (supplier_items), כך שכל שינוי מחיר אצל ספק
-- מתעדכן אוטומטית בכל מנה שמשתמשת במוצר.
--
-- הטבלאות שומרות רק את *המבנה* (מה ובכמה). החישוב עצמו — המרות יחידות,
-- פחת, מע״מ, אחוז רווח ומחיר מוצע — חי ב-src/lib/menuCosting.ts.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. הגדרות התמחור של העסק (שורה אחת לעסק)
-- ----------------------------------------------------------------------------
create table if not exists public.menu_settings (
  business_id          uuid primary key references public.businesses(id) on delete cascade,
  vat_pct              numeric(5,2) not null default 18,     -- מע״מ בישראל 18%
  prices_include_vat   boolean not null default true,        -- מחירי המכירה בתפריט כוללים מע״מ
  costs_include_vat    boolean not null default false,       -- מחירי הספקים כוללים מע״מ
  target_food_cost_pct numeric(5,2) not null default 30,     -- יעד Food Cost ברירת מחדל
  updated_at           timestamptz not null default now(),
  constraint menu_settings_vat_range check (vat_pct >= 0 and vat_pct <= 50),
  constraint menu_settings_target_range check (target_food_cost_pct > 0 and target_food_cost_pct < 100)
);

comment on table public.menu_settings is 'הגדרות תמחור תפריט לעסק — מע״מ, האם מחירים כוללים מע״מ, יעד Food Cost.';

drop trigger if exists trg_menu_settings_updated on public.menu_settings;
create trigger trg_menu_settings_updated
  before update on public.menu_settings
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 2. קטגוריות תפריט (ראשונות / עיקריות / קינוחים / שתייה ...)
-- ----------------------------------------------------------------------------
create table if not exists public.menu_categories (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name        text not null,
  color       text,
  sort_order  integer not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create index if not exists idx_menu_categories_business on public.menu_categories(business_id, sort_order);

-- ----------------------------------------------------------------------------
-- 3. מנות והכנות
--    kind = 'dish' — מנה בתפריט עם מחיר מכירה.
--    kind = 'prep' — הכנה/מתכון בסיס (רוטב, בצק) שמשמש כמרכיב במנות אחרות.
--    yield_qty + yield_measure — מה יוצא מהמתכון: למנה בדרך כלל 1 unit (מנה אחת);
--    להכנה למשל 2000 g רוטב. עלות ליחידת תוצר = עלות כוללת / yield.
-- ----------------------------------------------------------------------------
create table if not exists public.menu_dishes (
  id                   uuid primary key default gen_random_uuid(),
  business_id          uuid not null references public.businesses(id) on delete cascade,
  category_id          uuid references public.menu_categories(id) on delete set null,
  kind                 text not null default 'dish' check (kind in ('dish', 'prep')),
  name                 text not null,
  description          text,
  image_url            text,
  selling_price        numeric(10,2),                          -- מנה בלבד; לפי menu_settings.prices_include_vat
  yield_qty            numeric(12,3) not null default 1 check (yield_qty > 0),
  yield_measure        text not null default 'unit' check (yield_measure in ('g', 'ml', 'unit')),
  target_food_cost_pct numeric(5,2) check (target_food_cost_pct is null or (target_food_cost_pct > 0 and target_food_cost_pct < 100)),
  monthly_sales        integer check (monthly_sales is null or monthly_sales >= 0),  -- אופציונלי: להנדסת תפריט
  notes                text,
  sort_order           integer not null default 0,
  active               boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists idx_menu_dishes_business on public.menu_dishes(business_id, kind, sort_order);
create index if not exists idx_menu_dishes_category on public.menu_dishes(category_id);

comment on table public.menu_dishes is 'מנות (dish) והכנות בסיס (prep). עץ המנה נבנה דרך menu_dish_components.';

drop trigger if exists trg_menu_dishes_updated on public.menu_dishes;
create trigger trg_menu_dishes_updated
  before update on public.menu_dishes
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 4. מרכיבי המנה — הענפים של העץ
--    בדיוק אחד מ: item_id (מוצר מלאי) / sub_dish_id (הכנה או מנה אחרת).
--    unit — היחידה שבה נמדדת הכמות במתכון:
--      g / kg / ml / l / unit  — מידה אבסולוטית (מומרת דרך menu_item_conversions)
--      main                    — יחידת הרכש הראשית של המוצר (ארגז, ק״ג, בקבוק)
--      piece                   — פריט בודד בתוך המארז (בקבוק בארגז)
--    waste_pct — פחת/ניקיון: כדי לקבל 100 גרם נטו בפחת 10% צריך 111 גרם ברוטו.
--    supplier_id — נעיצת ספק ספציפי למחיר; null = הספק הזול ביותר.
-- ----------------------------------------------------------------------------
create table if not exists public.menu_dish_components (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses(id) on delete cascade,
  dish_id      uuid not null references public.menu_dishes(id) on delete cascade,
  item_id      uuid references public.inventory_items(id) on delete cascade,
  sub_dish_id  uuid references public.menu_dishes(id) on delete restrict,
  quantity     numeric(12,3) not null check (quantity > 0),
  unit         text not null default 'g' check (unit in ('g', 'kg', 'ml', 'l', 'unit', 'main', 'piece')),
  waste_pct    numeric(5,2) not null default 0 check (waste_pct >= 0 and waste_pct < 100),
  supplier_id  uuid references public.suppliers(id) on delete set null,
  notes        text,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  constraint menu_components_one_source check (
    (item_id is not null)::int + (sub_dish_id is not null)::int = 1
  ),
  constraint menu_components_no_self check (sub_dish_id is null or sub_dish_id <> dish_id)
);

create index if not exists idx_menu_components_business on public.menu_dish_components(business_id);
create index if not exists idx_menu_components_dish on public.menu_dish_components(dish_id, sort_order);
create index if not exists idx_menu_components_item on public.menu_dish_components(item_id);
create index if not exists idx_menu_components_sub on public.menu_dish_components(sub_dish_id);

comment on table public.menu_dish_components is 'מרכיבי מנה: מוצר מלאי או הכנה, כמות, יחידה, פחת וספק נעוץ.';

-- מניעת מעגל בעץ (A מכיל B שמכיל A): לפני הוספת ענף sub_dish, בודקים
-- שהמנה ההורה לא נמצאת בתוך תת-העץ של המרכיב.
create or replace function public.menu_components_prevent_cycle()
returns trigger
language plpgsql
as $$
begin
  if new.sub_dish_id is null then
    return new;
  end if;

  if exists (
    with recursive tree as (
      select c.sub_dish_id as dish
      from public.menu_dish_components c
      where c.dish_id = new.sub_dish_id and c.sub_dish_id is not null
      union
      select c.sub_dish_id
      from public.menu_dish_components c
      join tree t on c.dish_id = t.dish
      where c.sub_dish_id is not null
    )
    select 1 from tree where dish = new.dish_id
  ) then
    raise exception 'MENU_CYCLE: dish % is already contained in sub-recipe %', new.dish_id, new.sub_dish_id
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

drop trigger if exists trg_menu_components_cycle on public.menu_dish_components;
create trigger trg_menu_components_cycle
  before insert or update of sub_dish_id, dish_id on public.menu_dish_components
  for each row execute function public.menu_components_prevent_cycle();

-- ----------------------------------------------------------------------------
-- 5. המרות יחידות למוצר — "כמה יש בתוך יחידה אחת"
--    מוצרי מלאי נרכשים בארגזים/בקבוקים/ק״ג, אבל מתכון מדבר בגרמים ומ״ל.
--    content_qty/content_measure מתארים פריט בודד אחד (או יחידת הרכש הראשית
--    כשאין מארז): בקבוק שמן = 750 ml, שק קמח = 25000 g, ביצה = 1 unit.
--    ל-ק״ג / ליטר / גרם / מ״ל ההמרה מובנית בקוד ואין צורך בשורה כאן.
--    manual_unit_cost — מחיר ידני ליחידת רכש ראשית כשאין מחירון ספק.
-- ----------------------------------------------------------------------------
create table if not exists public.menu_item_conversions (
  item_id          uuid primary key references public.inventory_items(id) on delete cascade,
  business_id      uuid not null references public.businesses(id) on delete cascade,
  content_qty      numeric(12,3) check (content_qty is null or content_qty > 0),
  content_measure  text check (content_measure is null or content_measure in ('g', 'ml', 'unit')),
  manual_unit_cost numeric(10,2) check (manual_unit_cost is null or manual_unit_cost >= 0),
  updated_at       timestamptz not null default now(),
  constraint menu_conversions_content_pair check (
    (content_qty is null) = (content_measure is null)
  )
);

create index if not exists idx_menu_conversions_business on public.menu_item_conversions(business_id);

comment on table public.menu_item_conversions is 'כמה גרם/מ״ל/יחידות יש בפריט בודד של מוצר מלאי + מחיר ידני חלופי.';

drop trigger if exists trg_menu_conversions_updated on public.menu_item_conversions;
create trigger trg_menu_conversions_updated
  before update on public.menu_item_conversions
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 6. RLS — עלויות ורווחיות הן מידע רגיש: מנהל / מנהלת משרד / סופר-אדמין בלבד
-- ----------------------------------------------------------------------------
create or replace function public.can_manage_menu(b uuid)
returns boolean language sql stable as $$
  select public.can_access(b)
     and (public.is_super_admin() or public.auth_role() in ('manager', 'office_manager'))
$$;

alter table public.menu_settings         enable row level security;
alter table public.menu_categories       enable row level security;
alter table public.menu_dishes           enable row level security;
alter table public.menu_dish_components  enable row level security;
alter table public.menu_item_conversions enable row level security;

drop policy if exists "menu_settings_manage" on public.menu_settings;
create policy "menu_settings_manage" on public.menu_settings
  for all using (public.can_manage_menu(business_id)) with check (public.can_manage_menu(business_id));

drop policy if exists "menu_categories_manage" on public.menu_categories;
create policy "menu_categories_manage" on public.menu_categories
  for all using (public.can_manage_menu(business_id)) with check (public.can_manage_menu(business_id));

drop policy if exists "menu_dishes_manage" on public.menu_dishes;
create policy "menu_dishes_manage" on public.menu_dishes
  for all using (public.can_manage_menu(business_id)) with check (public.can_manage_menu(business_id));

drop policy if exists "menu_components_manage" on public.menu_dish_components;
create policy "menu_components_manage" on public.menu_dish_components
  for all using (public.can_manage_menu(business_id)) with check (public.can_manage_menu(business_id));

drop policy if exists "menu_conversions_manage" on public.menu_item_conversions;
create policy "menu_conversions_manage" on public.menu_item_conversions
  for all using (public.can_manage_menu(business_id)) with check (public.can_manage_menu(business_id));

-- ----------------------------------------------------------------------------
-- 7. תמונות מנות — bucket ציבורי לקריאה, כתיבה למשתמשים מחוברים
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('menu', 'menu', true)
on conflict (id) do nothing;

drop policy if exists "menu_public_read" on storage.objects;
create policy "menu_public_read" on storage.objects
  for select using (bucket_id = 'menu');

drop policy if exists "menu_auth_insert" on storage.objects;
create policy "menu_auth_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'menu');

drop policy if exists "menu_auth_update" on storage.objects;
create policy "menu_auth_update" on storage.objects
  for update to authenticated using (bucket_id = 'menu');

drop policy if exists "menu_auth_delete" on storage.objects;
create policy "menu_auth_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'menu');

-- ----------------------------------------------------------------------------
-- 8. חיווט המודול לקטלוג הפיצ'רים
--    menu דורש inventory (המרכיבים הם מוצרי מלאי והמחירים מגיעים מהספקים).
-- ----------------------------------------------------------------------------

-- תלויות: הדלקת menu מדליקה inventory; כיבוי inventory מכבה menu (ו-waste).
create or replace function public.enforce_feature_dependencies()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parent_of constant jsonb := '{"waste": "inventory", "menu": "inventory", "payroll": "attendance"}'::jsonb;
  parent_key text;
begin
  parent_key := parent_of ->> new.feature_key;

  if new.enabled then
    if parent_key is not null then
      insert into public.business_features (business_id, feature_key, enabled)
      values (new.business_id, parent_key, true)
      on conflict (business_id, feature_key) do update set enabled = true;
    end if;
  else
    update public.business_features f
    set enabled = false
    where f.business_id = new.business_id
      and f.enabled
      and (parent_of ->> f.feature_key) = new.feature_key;
  end if;

  return new;
end $$;

-- מפת בעלות למחיקת דאטה בכיבוי מודול (מקבילה: src/lib/featureData.ts)
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
        'menu_dish_components', 'menu_item_conversions', 'menu_dishes', 'menu_categories', 'menu_settings',
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

-- המנה ההורה מוחקת את הענף שלה; הכנה שנמחקת ישירות חסומה (restrict) — אבל
-- במחיקת כל המודול הסדר מוחק קודם את הענפים ואז את המנות, אז אין התנגשות.

create or replace function public.super_admin_apply_features(
  p_business_id uuid,
  p_enabled     text[],
  p_plan        text,
  p_purge       text[] default '{}'::text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  all_keys constant text[] := array[
    'attendance', 'shifts', 'tasks', 'payroll', 'agreements',
    'shift_reports', 'inventory', 'waste', 'menu', 'faults', 'events'
  ];
  want      text[] := coalesce(p_enabled, '{}'::text[]);
  kill      text[] := coalesce(p_purge, '{}'::text[]);
  key       text;
  purge_res jsonb := jsonb_build_object('deleted', '{}'::jsonb, 'rows_total', 0);
begin
  if not public.is_super_admin() then
    raise exception 'FORBIDDEN: super admin only' using errcode = 'insufficient_privilege';
  end if;

  if p_business_id is null then
    raise exception 'BUSINESS_REQUIRED' using errcode = 'invalid_parameter_value';
  end if;

  foreach key in array want || kill loop
    if not (key = any (all_keys)) then
      raise exception 'UNKNOWN_FEATURE: %', key using errcode = 'invalid_parameter_value';
    end if;
  end loop;

  foreach key in array kill loop
    if key = any (want) then
      raise exception 'PURGE_CONFLICT: % is both enabled and purged', key
        using errcode = 'invalid_parameter_value';
    end if;
  end loop;

  foreach key in array all_keys loop
    insert into public.business_features (business_id, feature_key, enabled)
    values (p_business_id, key, key = any (want))
    on conflict (business_id, feature_key)
      do update set enabled = excluded.enabled;
  end loop;

  if p_plan is not null then
    update public.businesses set plan = p_plan::public.business_plan where id = p_business_id;
  end if;

  if cardinality(kill) > 0 then
    purge_res := public.purge_feature_data(p_business_id, kill);
  end if;

  return purge_res;
end $$;

-- ----------------------------------------------------------------------------
-- 9. הפעלה לעסקים קיימים: מי שיש לו מלאי מקבל את מודול התפריט (שייך לתוכנית צמיחה)
-- ----------------------------------------------------------------------------
insert into public.business_features (business_id, feature_key, enabled)
select f.business_id, 'menu', true
from public.business_features f
where f.feature_key = 'inventory' and f.enabled
on conflict (business_id, feature_key) do update set enabled = true;
