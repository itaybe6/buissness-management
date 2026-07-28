-- ============================================================================
-- 057 — כיבוי מודול מוחק את הדאטה שלו
--
-- עד היום כיבוי מודול רק הסתיר תפריט. מעכשיו כיבוי = מחיקת הנתונים של המודול
-- לאותו עסק, בטרנזקציה אחת עם עדכון הדגלים, עם דוח מקדים לסופר אדמין ורישום
-- ביומן מחיקות.
--
-- מקבילה ב-TypeScript: src/lib/featureData.ts (FEATURE_DATA / PURGE_ORDER).
-- בדיקת ההתאמה בין השניים: tests/super-admin/featurePurge.test.ts
--
-- קבצים ב-Storage לא נמחקים כאן: מחיקה מ-storage.objects דרך SQL משאירה את
-- הקובץ עצמו ב-bucket. הניקוי שלהם רץ מהקליינט דרך storage API
-- (src/api/businesses.ts → purgeFeatureStorage), best-effort, לפי התיקייה
-- business_id/ בכל bucket.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. יומן מחיקות — מי כיבה מה, מתי, וכמה שורות נמחקו
-- ---------------------------------------------------------------------------
create table if not exists public.business_feature_purges (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses(id) on delete cascade,
  feature_keys text[] not null default '{}'::text[],
  -- {"attendance": 412, "tips": 88} — טבלה → מספר שורות שנמחקו
  deleted      jsonb not null default '{}'::jsonb,
  rows_total   integer not null default 0,
  purged_by    uuid references auth.users(id),
  purged_at    timestamptz not null default now()
);

comment on table public.business_feature_purges is
  'יומן מחיקות: כל כיבוי מודול שמחק דאטה נרשם כאן (סופר אדמין בלבד)';

create index if not exists idx_feature_purges_business
  on public.business_feature_purges(business_id, purged_at desc);

alter table public.business_feature_purges enable row level security;

drop policy if exists "feature_purges_super_admin" on public.business_feature_purges;
create policy "feature_purges_super_admin" on public.business_feature_purges
  for all using (public.is_super_admin()) with check (public.is_super_admin());

-- ---------------------------------------------------------------------------
-- 2. מפת בעלות: איזה טבלאות שייכות לאיזה מודול
--
--    כל טבלה שייכת למודול אחד בדיוק. טבלאות שכמה מודולים קוראים מהן
--    (shift_templates, departments, profiles) הן הגדרות של העסק — הן לא
--    מופיעות כאן ולכן מחיקה לא נוגעת בהן.
--
--    הסדר בתוך כל מערך הוא סדר המחיקה: ילדים לפני הורים.
-- ---------------------------------------------------------------------------
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

comment on function public.feature_data_tables(text) is
  'מפת בעלות: אילו טבלאות נמחקות בכיבוי מודול, בסדר מחיקה (ילדים קודם)';

-- סדר מחיקה גלובלי — כשמכבים כמה מודולים בלחיצה אחת, המחיקה חייבת לרוץ
-- בסדר שלא שובר מפתחות זרים.
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

-- ---------------------------------------------------------------------------
-- 3. דוח מקדים: כמה שורות באמת ימחקו
--
--    נקרא לפני הצגת חלון האישור, כדי שהסופר אדמין יראה מספרים אמיתיים
--    ולא איום כללי. read-only.
-- ---------------------------------------------------------------------------
create or replace function public.feature_data_report(
  p_business_id uuid,
  p_features    text[]
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  feature     text;
  rec         record;
  n           bigint;
  per_feature jsonb;
  out_json    jsonb := '{}'::jsonb;
begin
  if not public.is_super_admin() then
    raise exception 'FORBIDDEN: super admin only' using errcode = 'insufficient_privilege';
  end if;

  if p_business_id is null or p_features is null then
    return out_json;
  end if;

  foreach feature in array p_features loop
    per_feature := '{}'::jsonb;

    for rec in select tbl, filter from public.feature_data_tables(feature) loop
      execute format(
        'select count(*) from public.%I where business_id = $1 %s',
        rec.tbl,
        case when rec.filter is null then '' else 'and ' || rec.filter end
      )
      into n
      using p_business_id;

      per_feature := per_feature || jsonb_build_object(rec.tbl, n);
    end loop;

    out_json := out_json || jsonb_build_object(feature, per_feature);
  end loop;

  return out_json;
end $$;

comment on function public.feature_data_report(uuid, text[]) is
  'כמה שורות ימחקו בכיבוי המודולים האלה — לחלון האישור. לא מוחק כלום.';

-- ---------------------------------------------------------------------------
-- 4. המחיקה עצמה
--
--    security definer: עוקף RLS בכוונה, כי סופר אדמין לא שייך לעסק. הבדיקה
--    הראשונה בפונקציה היא is_super_admin(), ובלעדיה שום דבר לא רץ.
-- ---------------------------------------------------------------------------
create or replace function public.purge_feature_data(
  p_business_id uuid,
  p_features    text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  rec     record;
  n       integer;
  deleted jsonb := '{}'::jsonb;
  total   integer := 0;
begin
  if not public.is_super_admin() then
    raise exception 'FORBIDDEN: super admin only' using errcode = 'insufficient_privilege';
  end if;

  if p_business_id is null or p_features is null or cardinality(p_features) = 0 then
    return jsonb_build_object('deleted', deleted, 'rows_total', 0);
  end if;

  if not exists (select 1 from public.businesses where id = p_business_id) then
    raise exception 'BUSINESS_NOT_FOUND: %', p_business_id using errcode = 'no_data_found';
  end if;

  -- כל הטבלאות של כל המודולים שכובו, ללא כפילויות, בסדר מחיקה בטוח.
  -- כשאותה טבלה מופיעה גם ללא סינון וגם עם סינון (tasks מול משימות אירוע),
  -- המחיקה הרחבה מנצחת והמסוננת נזרקת.
  for rec in
    with wanted as (
      select t.tbl, t.filter
      from unnest(p_features) as f(feature)
      cross join lateral public.feature_data_tables(f.feature) as t
    ),
    unscoped as (
      select distinct tbl from wanted where filter is null
    )
    select w.tbl, min(w.filter) as filter
    from wanted w
    where w.filter is null or w.tbl not in (select tbl from unscoped)
    group by w.tbl
    order by public.feature_purge_rank(w.tbl), w.tbl
  loop
    execute format(
      'delete from public.%I where business_id = $1 %s',
      rec.tbl,
      case when rec.filter is null then '' else 'and ' || rec.filter end
    )
    using p_business_id;

    get diagnostics n = row_count;
    if n > 0 then
      deleted := deleted || jsonb_build_object(rec.tbl, n);
      total := total + n;
    end if;
  end loop;

  insert into public.business_feature_purges (business_id, feature_keys, deleted, rows_total, purged_by)
  values (p_business_id, p_features, deleted, total, auth.uid());

  return jsonb_build_object('deleted', deleted, 'rows_total', total);
end $$;

comment on function public.purge_feature_data(uuid, text[]) is
  'מוחק את כל הדאטה של המודולים לעסק אחד. סופר אדמין בלבד. נרשם ביומן.';

-- ---------------------------------------------------------------------------
-- 5. כתיבת מצב המודולים + מחיקה — פעולה אטומית אחת
--
--    חשוב שזה יהיה RPC אחד: אם המחיקה נכשלת באמצע, גם הדגלים חוזרים לאחור.
--    אחרת אפשר להישאר עם מודול כבוי ודאטה חצי-מחוקה.
-- ---------------------------------------------------------------------------
create or replace function public.super_admin_apply_features(
  p_business_id uuid,
  p_enabled     text[],          -- המודולים שיהיו דלוקים בסוף
  p_plan        text,            -- 'starter' | 'growth' | 'full' | 'custom'
  p_purge       text[] default '{}'::text[]  -- מודולים שכובו ויש למחוק להם דאטה
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  all_keys constant text[] := array[
    'attendance', 'shifts', 'tasks', 'payroll', 'agreements',
    'shift_reports', 'inventory', 'waste', 'faults', 'events'
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

  -- מפתח לא מוכר = באג בקליינט, לא שקט
  foreach key in array want || kill loop
    if not (key = any (all_keys)) then
      raise exception 'UNKNOWN_FEATURE: %', key using errcode = 'invalid_parameter_value';
    end if;
  end loop;

  -- אסור לכבות-ולמחוק מודול שאמור להישאר דלוק
  foreach key in array kill loop
    if key = any (want) then
      raise exception 'PURGE_CONFLICT: % is both enabled and purged', key
        using errcode = 'invalid_parameter_value';
    end if;
  end loop;

  -- שורה לכל מפתח, כך שלעסק יש תשובה מפורשת לכל מודול
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

comment on function public.super_admin_apply_features(uuid, text[], text, text[]) is
  'כותב את מצב המודולים של העסק ומוחק דאטה של מודולים שכובו — טרנזקציה אחת';

revoke all on function public.feature_data_report(uuid, text[]) from public;
revoke all on function public.purge_feature_data(uuid, text[]) from public;
revoke all on function public.super_admin_apply_features(uuid, text[], text, text[]) from public;

grant execute on function public.feature_data_report(uuid, text[]) to authenticated;
grant execute on function public.purge_feature_data(uuid, text[]) to authenticated;
grant execute on function public.super_admin_apply_features(uuid, text[], text, text[]) to authenticated;
