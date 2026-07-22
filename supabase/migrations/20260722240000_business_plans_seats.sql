-- 049: חבילות מנוי, מגבלת מושבים ומטא-דאטה לעסק (סופר אדמין)
-- מריצים ב-SQL Editor של Supabase.

-- ----------------------------------------------------------------------------
-- 1. חבילת מנוי לעסק
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'business_plan') then
    create type public.business_plan as enum ('starter', 'growth', 'full', 'custom');
  end if;
end $$;

alter table public.businesses
  add column if not exists plan public.business_plan not null default 'custom';

-- מגבלת משתמשים (מושבים). null = ללא הגבלה.
alter table public.businesses
  add column if not exists max_users integer
    check (max_users is null or max_users > 0);

-- הערה פנימית של הסופר אדמין על העסק (לא נחשף למנהל העסק)
alter table public.businesses
  add column if not exists admin_notes text;

-- ----------------------------------------------------------------------------
-- 2. השלמת שורות business_features לכל עסק קיים
--    עד היום מנהל עסק עקף את בורר המודולים באפליקציה, ולכן ייתכנו עסקים
--    ללא שורות בכלל. משלימים כל מפתח חסר כ-enabled כדי שההגבלה החדשה
--    לא תנתק עסק פעיל ממודול שהוא כבר משתמש בו.
-- ----------------------------------------------------------------------------
insert into public.business_features (business_id, feature_key, enabled)
select b.id, k.feature_key, true
from public.businesses b
cross join (
  values ('agreements'), ('shifts'), ('shift_reports'), ('payroll'), ('attendance'),
         ('inventory'), ('waste'), ('faults'), ('events'), ('tasks')
) as k(feature_key)
where not exists (
  select 1 from public.business_features f
  where f.business_id = b.id and f.feature_key = k.feature_key
);

-- ----------------------------------------------------------------------------
-- 3. אכיפת תלויות ברמת ה-DB
--    בלאי מפחית מהמלאי; חישוב שכר שואב שעות מהחתמות הנוכחות.
--    כיבוי ההורה מכבה את הבן, והדלקת הבן מדליקה את ההורה.
-- ----------------------------------------------------------------------------
create or replace function public.enforce_feature_dependencies()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  -- feature_key -> המודול שהוא דורש
  parent_of constant jsonb := '{"waste": "inventory", "payroll": "attendance"}'::jsonb;
  parent_key text;
begin
  parent_key := parent_of ->> new.feature_key;

  if new.enabled then
    -- הדלקת בן מדליקה את ההורה שלו
    if parent_key is not null then
      insert into public.business_features (business_id, feature_key, enabled)
      values (new.business_id, parent_key, true)
      on conflict (business_id, feature_key) do update set enabled = true;
    end if;
  else
    -- כיבוי הורה מכבה את כל הבנים שתלויים בו
    update public.business_features f
    set enabled = false
    where f.business_id = new.business_id
      and f.enabled
      and (parent_of ->> f.feature_key) = new.feature_key;
  end if;

  return new;
end $$;

drop trigger if exists trg_feature_dependencies on public.business_features;
create trigger trg_feature_dependencies
  after insert or update of enabled on public.business_features
  for each row execute function public.enforce_feature_dependencies();

-- ----------------------------------------------------------------------------
-- 4. אכיפת מגבלת המושבים — חוסמת יצירת משתמש מעבר ל-max_users
-- ----------------------------------------------------------------------------
create or replace function public.enforce_business_seat_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  seat_cap integer;
  used integer;
begin
  if new.business_id is null then
    return new;
  end if;

  -- רק בשיוך חדש לעסק (יצירה, או העברה בין עסקים)
  if tg_op = 'UPDATE' and new.business_id is not distinct from old.business_id then
    return new;
  end if;

  select max_users into seat_cap from public.businesses where id = new.business_id;
  if seat_cap is null then
    return new;
  end if;

  select count(*) into used
  from public.profiles
  where business_id = new.business_id and id <> new.id;

  if used >= seat_cap then
    raise exception 'SEAT_LIMIT_REACHED: business % is capped at % users', new.business_id, seat_cap
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

drop trigger if exists trg_business_seat_limit on public.profiles;
create trigger trg_business_seat_limit
  before insert or update of business_id on public.profiles
  for each row execute function public.enforce_business_seat_limit();
