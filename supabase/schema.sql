-- ============================================================================
-- מערכת ניהול עסקים (Multi-Tenant SaaS) — סכמת Supabase מלאה
-- התחברות: מייל + סיסמה (Supabase Auth)
-- בידוד נתונים: כל טבלה מסומנת ב-business_id + RLS
-- הרצה: Supabase Dashboard -> SQL Editor -> Run
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. הכנה: ביטול בדיקת גוף פונקציות + ניקוי (מאפשר הרצה חוזרת נקייה)
-- ----------------------------------------------------------------------------
-- מאפשר ליצור פונקציות שמפנות לטבלאות שעדיין לא נוצרו
set check_function_bodies = off;

-- ניקוי טריגר על auth.users (אם קיים מהרצה קודמת)
drop trigger if exists on_auth_user_created on auth.users;

-- מחיקת טבלאות (אם קיימות) בסדר תלות
drop table if exists
  public.tasks, public.task_templates, public.events, public.faults, public.inventory_logs,
  public.inventory_waste, public.inventory_orders, public.inventory_counts, public.inventory_items,
  public.payroll_records,
  public.tips, public.shift_bonuses, public.shift_reports, public.attendance, public.shift_assignments, public.shift_preferences,
  public.shift_templates, public.departments,
  public.form_101, public.agreement_signatures, public.agreement_templates,
  public.business_features, public.profiles, public.businesses cascade;

-- מחיקת פונקציות (אם קיימות)
drop function if exists public.handle_new_user cascade;
drop function if exists public.can_access cascade;
drop function if exists public.is_super_admin cascade;
drop function if exists public.auth_role cascade;
drop function if exists public.auth_business_id cascade;
drop function if exists public.set_updated_at cascade;

-- מחיקת סוגים (enums) אם קיימים
drop type if exists
  public.user_role, public.shift_period, public.availability,
  public.fault_status, public.agreement_type, public.task_type,
  public.task_status, public.task_approval, public.order_status,
  public.inventory_action cascade;

-- ----------------------------------------------------------------------------
-- 0.1 הרחבות (Extensions)
-- ----------------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. סוגים (Enums)
-- ----------------------------------------------------------------------------

-- תפקידי משתמש
create type public.user_role as enum (
  'super_admin',       -- שולט על כל הפלטפורמה, מוסיף עסקים
  'manager',           -- מנהל - רואה הכל בעסק שלו
  'shift_manager',     -- אחראי משמרת - סידור עבודה, אילוצים, חשבוניות ודוח סגירת קופה
  'office_manager',    -- מנהלת משרד / מזכירה - שכר ומלאי
  'employee',          -- עובד
  'maintenance'        -- איש אחזקה - רואה רק תקלות
);

-- חלקי משמרת
create type public.shift_period as enum ('morning', 'noon', 'evening');

-- העדפת זמינות באילוצים
create type public.availability as enum ('prefer', 'available', 'cannot');

-- סטטוס תקלה
create type public.fault_status as enum ('needs_handling', 'in_progress', 'handled');

-- סוג הסכם
create type public.agreement_type as enum ('work', 'sexual_harassment', 'other', 'form_101');

-- סוג משימה
create type public.task_type as enum ('one_time', 'recurring');

-- סטטוס משימה
create type public.task_status as enum ('open', 'in_progress', 'done');

-- סטטוס אישור משימה (null = לא דורש אישור; pending = ממתין לאישור מנהל; approved = אושר)
create type public.task_approval as enum ('pending', 'approved');

-- סטטוס הזמנת סחורה
create type public.order_status as enum ('requested', 'ordered', 'received');

-- סוג פעולה ביומן עדכוני המלאי
create type public.inventory_action as enum ('created', 'count', 'edited', 'waste', 'order');


-- ----------------------------------------------------------------------------
-- 2. פונקציות עזר
-- ----------------------------------------------------------------------------

-- עדכון אוטומטי של updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end; $$;

-- שליפת ה-business_id של המשתמש המחובר (security definer כדי למנוע רקורסיה ב-RLS)
create or replace function public.auth_business_id()
returns uuid language sql stable security definer set search_path = public as $$
  select business_id from public.profiles where id = auth.uid()
$$;

-- שליפת התפקיד של המשתמש המחובר
create or replace function public.auth_role()
returns public.user_role language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

-- האם המשתמש הוא סופר אדמין
create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.auth_role() = 'super_admin', false)
$$;


-- ----------------------------------------------------------------------------
-- 3. עסקים (Businesses) + פיצ'רים לכל עסק
-- ----------------------------------------------------------------------------

create table public.businesses (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  active      boolean not null default true,
  -- הגדרות מיקום לשעון נוכחות (Geofence)
  location_address text,
  location_lat   double precision,
  location_lng   double precision,
  location_radius_m integer default 100,
  -- מתג: לדרוש מיקום GPS ברדיוס בהחתמת נוכחות
  attendance_geofence_enabled boolean not null default true,
  -- תפקידים שפטורים מבדיקת רדיוס (כניסה מכל מקום)
  attendance_geofence_exempt_roles public.user_role[] not null default '{}',
  -- מתג: לדרוש אישור מנהל למשימות שאחראי משמרת מוריד לאיש אחזקה
  maintenance_task_approval boolean not null default false,
  -- חלון הגשת זמינות לשבוע הבא (יום+שעה; null = ללא הגבלה / פתוח מההתחלה)
  shift_prefs_open_dow smallint check (shift_prefs_open_dow is null or (shift_prefs_open_dow >= 0 and shift_prefs_open_dow <= 6)),
  shift_prefs_open_time time default '21:00',
  shift_prefs_deadline_dow smallint check (shift_prefs_deadline_dow is null or (shift_prefs_deadline_dow >= 0 and shift_prefs_deadline_dow <= 6)),
  shift_prefs_deadline_time time default '20:00',
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- בורר פיצ'רים: איזה מודולים פעילים לכל עסק (סופר אדמין מגדיר)
create table public.business_features (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  feature_key text not null,   -- 'agreements','forms','shifts','payroll','attendance','inventory','faults','events','tasks'
  enabled     boolean not null default true,
  unique (business_id, feature_key)
);


-- ----------------------------------------------------------------------------
-- 3.1 מחלקות (Departments) — מטבח / בר / מלצרות / אירוח ...
--     כל עובד משויך למחלקה, וסידור העבודה נבנה לכל מחלקה בנפרד.
-- ----------------------------------------------------------------------------
create table public.departments (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name        text not null,
  color       text default '#7c3aed',
  sort_order  integer not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 4. פרופילים (משתמשים) — מקושר ל-Supabase Auth
-- ----------------------------------------------------------------------------

create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  business_id uuid references public.businesses(id) on delete cascade, -- null עבור super_admin
  department_id uuid references public.departments(id) on delete set null, -- שיוך למחלקה
  full_name   text,
  avatar_url  text,                   -- תמונת פרופיל ב-Storage
  email       text,
  phone       text,
  role        public.user_role not null default 'employee',
  hourly_rate numeric(10,2) default 0,  -- שכר שעתי (לעובד טיפים זהו מינימום/רצפה)
  wage_type   text not null default 'hourly' check (wage_type in ('hourly', 'tips')), -- שעתי / טיפים
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- יצירת פרופיל אוטומטית כשנרשם משתמש חדש ב-Auth
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, business_id, role, department_id, phone, hourly_rate, wage_type)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    (new.raw_user_meta_data->>'business_id')::uuid,
    coalesce((new.raw_user_meta_data->>'role')::public.user_role, 'employee'),
    (new.raw_user_meta_data->>'department_id')::uuid,
    new.raw_user_meta_data->>'phone',
    coalesce((new.raw_user_meta_data->>'hourly_rate')::numeric, 0),
    coalesce(new.raw_user_meta_data->>'wage_type', 'hourly')
  );
  return new;
end; $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ----------------------------------------------------------------------------
-- 5. מודול: הסכמים
-- ----------------------------------------------------------------------------

create table public.agreement_templates (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  type        public.agreement_type not null default 'work',
  title       text not null,
  content     text not null default '',  -- ניתן לעריכה ע"י המנהל
  file_url    text,                      -- קובץ PDF/DOC מצורף (אופציונלי)
  signature_fields jsonb not null default '[]'::jsonb, -- תיבות חתימה לכל עמוד: [{id,page,x,y,w,h} מנורמל 0..1]
  employee_id uuid references public.profiles(id) on delete cascade, -- null = קבוע לכל העובדים
  is_editable boolean not null default true,
  created_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.agreement_signatures (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.businesses(id) on delete cascade,
  agreement_id  uuid not null references public.agreement_templates(id) on delete cascade,
  employee_id   uuid not null references public.profiles(id) on delete cascade,
  agreed        boolean not null default false,  -- "קראתי והסכמתי"
  signature_data text,                           -- חתימה דיגיטלית (base64) — תאימות לאחור
  field_signatures jsonb not null default '{}'::jsonb, -- מיפוי fieldId -> תמונת חתימה (dataURL)
  signed_file_url text,                          -- ה-PDF הסופי החתום (חתימות מוטבעות)
  signed_at     timestamptz,
  created_at    timestamptz not null default now(),
  unique (agreement_id, employee_id)
);


-- ----------------------------------------------------------------------------
-- 6. מודול: טפסים (טופס 101)
-- ----------------------------------------------------------------------------

create table public.form_101 (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.businesses(id) on delete cascade,
  employee_id   uuid not null references public.profiles(id) on delete cascade,
  tax_year      integer not null,
  data          jsonb not null default '{}'::jsonb, -- כל שדות הטופס
  submitted     boolean not null default false,
  submitted_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (employee_id, tax_year)
);


-- ----------------------------------------------------------------------------
-- 7. מודול: הגשת משמרות + סידור עבודה
-- ----------------------------------------------------------------------------

-- שעות משמרת דינמיות לכל עסק. המנהל מגדיר/עורך/מוחק משמרות, וכל מקום
-- שמתייחס למשמרת שולף מכאן במקום מערכים קבועים.
create table public.shift_templates (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  shift_key   text,                          -- morning / afternoon / evening / night
  name        text not null,                 -- לדוגמה: בוקר / ערב
  start_time  time not null,
  end_time    time not null,
  color       text default '#7c3aed',
  active      boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

-- אילוצים שהעובד מגיש
create table public.shift_preferences (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  employee_id uuid not null references public.profiles(id) on delete cascade,
  week_start  date not null,                 -- תחילת השבוע
  shift_date  date not null,
  shift_template_id uuid not null references public.shift_templates(id) on delete cascade,
  preference  public.availability not null,  -- מעדיף/יכול/לא יכול
  note        text,
  created_at  timestamptz not null default now(),
  unique (employee_id, shift_date, shift_template_id)
);

-- סידור עבודה שמנהל המשמרת בונה
create table public.shift_assignments (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  department_id uuid references public.departments(id) on delete cascade,
  employee_id uuid not null references public.profiles(id) on delete cascade,
  shift_date  date not null,
  shift_template_id uuid not null references public.shift_templates(id) on delete cascade,
  assigned_by uuid references public.profiles(id),
  created_at  timestamptz not null default now(),
  unique (employee_id, shift_date, shift_template_id)
);


-- ----------------------------------------------------------------------------
-- 8. מודול: שעון נוכחות (Geofence)
-- ----------------------------------------------------------------------------

create table public.attendance (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.businesses(id) on delete cascade,
  employee_id   uuid not null references public.profiles(id) on delete cascade,
  clock_in      timestamptz,
  clock_out     timestamptz,
  clock_in_lat  double precision,
  clock_in_lng  double precision,
  within_radius boolean default false,  -- האם היה ברדיוס המותר
  created_at    timestamptz not null default now()
);


-- ----------------------------------------------------------------------------
-- 9. מודול: חישוב שכר (טיפים + שעות) + דוח סגירת משמרת
-- ----------------------------------------------------------------------------

-- דוח סיכום משמרת / סגירת קופה שממלא אחראי המשמרת.
-- השדות הכספיים מזינים את הטיפים בשכר; השדות החופשיים מתעדים את תחקיר הצוות.
create table public.shift_reports (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references public.businesses(id) on delete cascade,
  report_date     date not null,
  shift_template_id uuid references public.shift_templates(id) on delete set null,
  manager_names   text,                        -- אחמ"ש: ים וגד
  total_sales     numeric(12,2) not null default 0,
  delivery_sales  numeric(12,2) not null default 0,   -- משלוחים (וולט)
  avg_per_diner   numeric(10,2) not null default 0,
  total_tips      numeric(12,2) not null default 0,
  service_pct     numeric(6,2)  not null default 0,
  tips_hourly     numeric(10,2) not null default 0,    -- שכר שעתי מטיפים (מחושב)
  first_release   text,                        -- מתי שוחרר עובד ראשון
  energy_level    smallint check (energy_level is null or (energy_level >= 1 and energy_level <= 10)),
  unusual_events  text,                         -- אירועים חריגים
  team_talks      text,                         -- שיחות/פידבק שנעשו במשמרת
  team_voice      text,                         -- הקול של הצוות
  daily_tasks_done boolean not null default false,
  urgent_inventory text,                        -- מלאי שנגמר וחייב הזמנה דחופה
  faults_maintenance text,                      -- תקלות ותחזוקה
  extra           jsonb not null default '{}'::jsonb,  -- מוני מכירות דינמיים + משתתפי טיפים
  invoice_urls    text[] not null default '{}', -- חשבוניות שהועלו ל-Storage
  created_by      uuid references public.profiles(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (business_id, report_date, shift_template_id)
);

create table public.tips (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  employee_id uuid not null references public.profiles(id) on delete cascade,
  shift_date  date not null,
  shift_template_id uuid references public.shift_templates(id) on delete set null,
  shift_report_id uuid references public.shift_reports(id) on delete cascade, -- מקור הטיפ (דוח משמרת)
  amount      numeric(10,2) not null default 0,
  hours       numeric(6,2),                    -- שעות באותה משמרת
  hourly_from_tips numeric(10,2),              -- ממוצע שעתי מהטיפים
  created_at  timestamptz not null default now()
);

-- תוספת שכר מאחוז קופה לעובדים נבחרים בדוח משמרת
create table public.shift_bonuses (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references public.businesses(id) on delete cascade,
  employee_id       uuid not null references public.profiles(id) on delete cascade,
  shift_report_id   uuid not null references public.shift_reports(id) on delete cascade,
  shift_date        date not null,
  shift_template_id uuid references public.shift_templates(id) on delete set null,
  amount            numeric(10,2) not null default 0,
  bonus_pct         numeric(5,2) not null default 0,
  sales_base        numeric(12,2) not null default 0,
  created_at        timestamptz not null default now(),
  unique (shift_report_id, employee_id)
);

-- סיכום שכר חודשי לעובד (מנהלת המשרד)
create table public.payroll_records (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.businesses(id) on delete cascade,
  employee_id   uuid not null references public.profiles(id) on delete cascade,
  period_month  date not null,            -- החודש הרלוונטי
  total_hours   numeric(8,2) default 0,
  hourly_rate   numeric(10,2) default 0,
  total_tips    numeric(10,2) default 0,
  total_pay     numeric(12,2) default 0,
  created_by    uuid references public.profiles(id),
  created_at    timestamptz not null default now(),
  unique (employee_id, period_month)
);


-- ----------------------------------------------------------------------------
-- 10. מודול: סחורות / מלאי
-- ----------------------------------------------------------------------------

create table public.inventory_items (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.businesses(id) on delete cascade,
  name          text not null,
  unit          text,                 -- יחידה (יחידות, ארגז, ק"ג, ליטר)
  units_per_package numeric(12,2) check (units_per_package is null or units_per_package > 0),  -- יחידים ביחידת מידה (למשל 24 בארגז)
  image_url     text,                 -- תמונת המוצר ב-Storage
  min_quantity  numeric(12,2) not null default 0,  -- סף מלאי נמוך
  supplier_delivery_day smallint check (supplier_delivery_day between 0 and 6),  -- יום אספקה מהספק
  category      text,                 -- קטגוריית המוצר (חלבי, אלכוהול, יבשים וכו׳)
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

-- ספירת מלאי בסוף משמרת (העובד מעדכן)
create table public.inventory_counts (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  item_id     uuid not null references public.inventory_items(id) on delete cascade,
  employee_id uuid references public.profiles(id),
  quantity    numeric(12,2) not null default 0,
  counted_at  timestamptz not null default now()
);

-- הזמנות סחורה (מנהלת המשרד)
create table public.inventory_orders (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  item_id     uuid not null references public.inventory_items(id) on delete cascade,
  quantity    numeric(12,2) not null,
  status      public.order_status not null default 'requested',
  ordered_by  uuid references public.profiles(id),
  batch_id    uuid,                 -- קיבוץ שורות מאותה הזמנה
  created_at  timestamptz not null default now()
);

-- דיווחי בלאי (כל משתמש) — מוצרים שנפסלו/התבזבזו, עם אפשרות להפחית מהמלאי
create table public.inventory_waste (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  item_id     uuid not null references public.inventory_items(id) on delete cascade,
  employee_id uuid references public.profiles(id),
  quantity    numeric(12,2) not null default 0,
  note        text,
  deducted    boolean not null default false,
  created_at  timestamptz not null default now()
);

-- יומן עדכוני מלאי — תיעוד מי עידכן מה ומתי (בקרת מנהל)
create table public.inventory_logs (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.businesses(id) on delete cascade,
  item_id       uuid not null references public.inventory_items(id) on delete cascade,
  employee_id   uuid references public.profiles(id),       -- מי ביצע את העדכון
  action        public.inventory_action not null,
  previous_qty  numeric(12,2),                             -- כמות לפני
  new_qty       numeric(12,2),                             -- כמות אחרי / כמות הפעולה
  note          text,                                      -- פירוט הפעולה
  created_at    timestamptz not null default now()
);


-- ----------------------------------------------------------------------------
-- 11. מודול: דיווח תקלות
-- ----------------------------------------------------------------------------

create table public.faults (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  reported_by uuid references public.profiles(id),
  photo_urls  text[] not null default '{}',          -- קישורים לתמונות ב-Storage
  description text not null,
  status      public.fault_status not null default 'needs_handling',
  assigned_to uuid references public.profiles(id),   -- איש אחזקה
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);


-- ----------------------------------------------------------------------------
-- 12. מודול: אירועים
-- ----------------------------------------------------------------------------

create table public.events (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  title       text not null,
  description text,
  event_date  timestamptz not null,
  created_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now()
);


-- ----------------------------------------------------------------------------
-- 13. מודול: משימות (משימות קבועות + שיוך חד-פעמי)
-- ----------------------------------------------------------------------------

create table public.task_templates (
  id                 uuid primary key default gen_random_uuid(),
  business_id        uuid not null references public.businesses(id) on delete cascade,
  department_id      uuid references public.departments(id) on delete set null, -- שיוך למחלקה; null = כללי לכל העסק
  title              text not null,
  description        text,
  recurrence_weekday smallint check (recurrence_weekday is null or (recurrence_weekday >= -1 and recurrence_weekday <= 6)), -- -1 = כל יום
  active             boolean not null default true,
  sort_order         integer not null default 0,
  created_at         timestamptz not null default now()
);

create table public.tasks (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.businesses(id) on delete cascade,
  template_id   uuid references public.task_templates(id) on delete set null,
  title         text not null,
  description   text,
  type          public.task_type not null default 'one_time',
  assigned_to   uuid references public.profiles(id),   -- למי שויכה
  assigned_by   uuid references public.profiles(id),   -- מי הוריד אותה
  due_date      date,                                  -- למשימה חד-פעמית
  recurrence_weekday smallint,                         -- 0-6 למשימה קבועה
  status        public.task_status not null default 'open',
  approval_status public.task_approval,                -- null = לא דורש אישור; pending = ממתין לאישור מנהל; approved = אושר
  photo_url     text,                                  -- (לא בשימוש) תמונת ביצוע בודדת — נשמר לתאימות לאחור
  media_urls    text[] not null default '{}',          -- תמונות/סרטונים שהעובד צירף בעת הטיפול
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);


-- ----------------------------------------------------------------------------
-- 14. טריגרים ל-updated_at
-- ----------------------------------------------------------------------------
create trigger trg_businesses_updated   before update on public.businesses          for each row execute function public.set_updated_at();
create trigger trg_profiles_updated      before update on public.profiles            for each row execute function public.set_updated_at();
create trigger trg_agreements_updated    before update on public.agreement_templates for each row execute function public.set_updated_at();
create trigger trg_form101_updated       before update on public.form_101            for each row execute function public.set_updated_at();
create trigger trg_shift_reports_updated before update on public.shift_reports        for each row execute function public.set_updated_at();
create trigger trg_faults_updated        before update on public.faults              for each row execute function public.set_updated_at();
create trigger trg_tasks_updated         before update on public.tasks               for each row execute function public.set_updated_at();

-- משמרות ברירת מחדל לכל עסק חדש (בוקר / צהריים / ערב / לילה)
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

create trigger trg_business_seed_shifts
  after insert on public.businesses
  for each row execute function public.trg_business_seed_shifts();


-- ----------------------------------------------------------------------------
-- 15. אינדקסים על business_id (לביצועים)
-- ----------------------------------------------------------------------------
create index idx_profiles_business        on public.profiles(business_id);
create index idx_profiles_department       on public.profiles(department_id);
create index idx_departments_business       on public.departments(business_id);
create index idx_shift_templates_business  on public.shift_templates(business_id);
create unique index idx_shift_templates_business_key
  on public.shift_templates (business_id, shift_key)
  where shift_key is not null;
create index idx_features_business         on public.business_features(business_id);
create index idx_agr_templates_business    on public.agreement_templates(business_id);
create index idx_agr_templates_employee    on public.agreement_templates(employee_id);
create index idx_agr_signatures_business   on public.agreement_signatures(business_id);
create index idx_form101_business          on public.form_101(business_id);
create index idx_shift_pref_business        on public.shift_preferences(business_id);
create index idx_shift_assign_business      on public.shift_assignments(business_id);
create index idx_attendance_business        on public.attendance(business_id);
create index idx_shift_reports_business      on public.shift_reports(business_id);
create index idx_shift_reports_date          on public.shift_reports(business_id, report_date);
create index idx_tips_business              on public.tips(business_id);
create index idx_tips_shift_report           on public.tips(shift_report_id);
create index idx_shift_bonuses_business      on public.shift_bonuses(business_id);
create index idx_shift_bonuses_employee      on public.shift_bonuses(business_id, employee_id, shift_date);
create index idx_shift_bonuses_report        on public.shift_bonuses(shift_report_id);
create index idx_payroll_business           on public.payroll_records(business_id);
create index idx_inv_items_business         on public.inventory_items(business_id);
create index idx_inv_counts_business        on public.inventory_counts(business_id);
create index idx_inv_orders_business        on public.inventory_orders(business_id);
create index idx_inv_waste_business         on public.inventory_waste(business_id);
create index idx_inv_logs_business          on public.inventory_logs(business_id);
create index idx_inv_logs_item              on public.inventory_logs(item_id, created_at desc);
create index idx_faults_business            on public.faults(business_id);
create index idx_events_business            on public.events(business_id);
create index idx_task_templates_business    on public.task_templates(business_id);
create index idx_task_templates_department  on public.task_templates(department_id);
create index idx_tasks_business             on public.tasks(business_id);
create index idx_tasks_template             on public.tasks(template_id);
create index idx_tasks_approval             on public.tasks(business_id, approval_status) where approval_status is not null;


-- ============================================================================
-- 16. אבטחה ברמת השורה (Row Level Security)
--     כלל הזהב: כל עסק רואה רק את השורות שלו. סופר אדמין רואה הכל.
-- ============================================================================

-- הפעלת RLS על כל הטבלאות
alter table public.businesses          enable row level security;
alter table public.business_features    enable row level security;
alter table public.profiles             enable row level security;
alter table public.departments          enable row level security;
alter table public.shift_templates      enable row level security;
alter table public.agreement_templates  enable row level security;
alter table public.agreement_signatures enable row level security;
alter table public.form_101             enable row level security;
alter table public.shift_preferences    enable row level security;
alter table public.shift_assignments    enable row level security;
alter table public.attendance           enable row level security;
alter table public.shift_reports        enable row level security;
alter table public.tips                 enable row level security;
alter table public.shift_bonuses        enable row level security;
alter table public.payroll_records      enable row level security;
alter table public.inventory_items      enable row level security;
alter table public.inventory_counts     enable row level security;
alter table public.inventory_orders     enable row level security;
alter table public.inventory_waste      enable row level security;
alter table public.inventory_logs       enable row level security;
alter table public.faults               enable row level security;
alter table public.events               enable row level security;
alter table public.task_templates       enable row level security;
alter table public.tasks                enable row level security;

-- ---- businesses ----
create policy "businesses_super_admin_all" on public.businesses
  for all using (public.is_super_admin()) with check (public.is_super_admin());
create policy "businesses_member_read" on public.businesses
  for select using (id = public.auth_business_id());
create policy "businesses_manager_update" on public.businesses
  for update using (
    id = public.auth_business_id() and public.auth_role() = 'manager'
  ) with check (id = public.auth_business_id());

-- ---- profiles ----
-- כל משתמש רואה את עצמו
create policy "profiles_self_read" on public.profiles
  for select using (id = auth.uid());
create policy "profiles_self_update" on public.profiles
  for update using (id = auth.uid());
-- חברי אותו עסק נראים זה לזה
create policy "profiles_same_business" on public.profiles
  for select using (business_id = public.auth_business_id());
-- מנהל העסק יכול לעדכן פרופילים של עובדי העסק שלו (תפקיד, מחלקה, שכר, השבתה)
create policy "profiles_manager_update" on public.profiles
  for update using (
    business_id = public.auth_business_id() and public.auth_role() = 'manager'
  ) with check (
    business_id = public.auth_business_id()
  );
-- סופר אדמין - הכל
create policy "profiles_super_admin_all" on public.profiles
  for all using (public.is_super_admin()) with check (public.is_super_admin());

-- ---- business_features ----
create policy "features_super_admin_all" on public.business_features
  for all using (public.is_super_admin()) with check (public.is_super_admin());
create policy "features_member_read" on public.business_features
  for select using (business_id = public.auth_business_id());

-- ----------------------------------------------------------------------------
-- מאקרו ידני: לכל טבלת-עסק נוסיף policy אחיד של בידוד לפי business_id.
-- (סופר אדמין עובר דרך is_super_admin; שאר ההגבלות לפי תפקיד נאכפות באפליקציה)
-- ----------------------------------------------------------------------------

-- פונקציית בדיקה: האם מותר לגשת לשורה של business_id מסוים
create or replace function public.can_access(b uuid)
returns boolean language sql stable as $$
  select public.is_super_admin() or b = public.auth_business_id()
$$;

-- departments
create policy "departments_tenant" on public.departments
  for all using (public.can_access(business_id)) with check (public.can_access(business_id));
-- shift_templates
create policy "shift_templates_tenant" on public.shift_templates
  for all using (public.can_access(business_id)) with check (public.can_access(business_id));
-- agreement_templates — הסכם אישי חשוף רק לעובד המשויך (ולמנהלים)
create policy "agr_templates_read" on public.agreement_templates
  for select using (
    public.can_access(business_id)
    and (
      public.auth_role() in ('manager', 'office_manager', 'shift_manager')
      or employee_id is null
      or employee_id = auth.uid()
    )
  );
create policy "agr_templates_write" on public.agreement_templates
  for all using (
    public.can_access(business_id) and public.auth_role() in ('manager', 'shift_manager')
  ) with check (
    public.can_access(business_id) and public.auth_role() in ('manager', 'shift_manager')
  );
-- agreement_signatures — עובד רואה/חותם רק על שלו, מנהלים רואים הכל
create policy "agr_signatures_tenant" on public.agreement_signatures
  for all using (
    public.can_access(business_id)
    and (public.auth_role() in ('manager', 'office_manager', 'shift_manager') or employee_id = auth.uid())
  ) with check (
    public.can_access(business_id)
    and (public.auth_role() in ('manager', 'office_manager', 'shift_manager') or employee_id = auth.uid())
  );
-- form_101
create policy "form101_tenant" on public.form_101
  for all using (public.can_access(business_id)) with check (public.can_access(business_id));
-- shift_preferences
create policy "shift_pref_tenant" on public.shift_preferences
  for all using (public.can_access(business_id)) with check (public.can_access(business_id));
-- shift_assignments
create policy "shift_assign_tenant" on public.shift_assignments
  for all using (public.can_access(business_id)) with check (public.can_access(business_id));
-- attendance
create policy "attendance_tenant" on public.attendance
  for all using (public.can_access(business_id)) with check (public.can_access(business_id));
-- shift_reports
create policy "shift_reports_tenant" on public.shift_reports
  for all using (public.can_access(business_id)) with check (public.can_access(business_id));
-- tips
create policy "tips_tenant" on public.tips
  for all using (public.can_access(business_id)) with check (public.can_access(business_id));
-- shift_bonuses
create policy "shift_bonuses_tenant" on public.shift_bonuses
  for all using (public.can_access(business_id)) with check (public.can_access(business_id));
-- payroll_records
create policy "payroll_tenant" on public.payroll_records
  for all using (public.can_access(business_id)) with check (public.can_access(business_id));
-- inventory_items
create policy "inv_items_tenant" on public.inventory_items
  for all using (public.can_access(business_id)) with check (public.can_access(business_id));
-- inventory_counts
create policy "inv_counts_tenant" on public.inventory_counts
  for all using (public.can_access(business_id)) with check (public.can_access(business_id));
-- inventory_orders
create policy "inv_orders_tenant" on public.inventory_orders
  for all using (public.can_access(business_id)) with check (public.can_access(business_id));
-- inventory_waste
create policy "inv_waste_tenant" on public.inventory_waste
  for all using (public.can_access(business_id)) with check (public.can_access(business_id));
-- inventory_logs
create policy "inv_logs_tenant" on public.inventory_logs
  for all using (public.can_access(business_id)) with check (public.can_access(business_id));
-- faults
create policy "faults_tenant" on public.faults
  for all using (public.can_access(business_id)) with check (public.can_access(business_id));
-- events
create policy "events_tenant" on public.events
  for all using (public.can_access(business_id)) with check (public.can_access(business_id));
-- task_templates — קריאה לכולם, כתיבה למנהל בלבד
create policy "task_templates_read" on public.task_templates
  for select using (public.can_access(business_id));
create policy "task_templates_manager_write" on public.task_templates
  for all using (
    public.can_access(business_id) and public.auth_role() = 'manager'
  ) with check (
    public.can_access(business_id) and public.auth_role() = 'manager'
  );
-- tasks — קריאה לכולם; יצירה למנהל (או materialize ע"י העובד); עדכון למנהל/אחמ״ש/משויך; מחיקה למנהל
create policy "tasks_read" on public.tasks
  for select using (public.can_access(business_id));
create policy "tasks_insert" on public.tasks
  for insert with check (
    public.can_access(business_id)
    and (
      public.auth_role() = 'manager'
      or (template_id is not null and assigned_to = auth.uid())
    )
  );
create policy "tasks_update" on public.tasks
  for update using (
    public.can_access(business_id)
    and (
      public.auth_role() in ('manager', 'shift_manager')
      or assigned_to = auth.uid()
    )
  ) with check (public.can_access(business_id));
create policy "tasks_delete" on public.tasks
  for delete using (
    public.can_access(business_id) and public.auth_role() = 'manager'
  );

-- ----------------------------------------------------------------------------
-- מחיקת עובד — ניקוי הפניות לפני מחיקת auth.users
-- ----------------------------------------------------------------------------

create or replace function public.prep_delete_profile(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.agreement_templates set created_by = null where created_by = p_user_id;
  update public.shift_assignments set assigned_by = null where assigned_by = p_user_id;
  update public.shift_reports set created_by = null where created_by = p_user_id;
  update public.payroll_records set created_by = null where created_by = p_user_id;
  update public.inventory_counts set employee_id = null where employee_id = p_user_id;
  update public.inventory_orders set ordered_by = null where ordered_by = p_user_id;
  update public.inventory_waste set employee_id = null where employee_id = p_user_id;
  update public.inventory_logs set employee_id = null where employee_id = p_user_id;
  update public.faults set reported_by = null where reported_by = p_user_id;
  update public.faults set assigned_to = null where assigned_to = p_user_id;
  update public.events set created_by = null where created_by = p_user_id;
  update public.tasks set assigned_to = null where assigned_to = p_user_id;
  update public.tasks set assigned_by = null where assigned_by = p_user_id;

  if to_regclass('public.office_receipts') is not null then
    execute 'update public.office_receipts set created_by = null where created_by = $1'
      using p_user_id;
  end if;
end;
$$;

-- ============================================================================
-- סיום. הערות:
-- 1) הפעל ב-Authentication -> Providers את Email (מייל+סיסמה).
-- 2) להוספת משתמש לעסק: צור אותו ב-Auth עם user_metadata הכולל
--    full_name, role, business_id (handle_new_user יוצר פרופיל אוטומטית).
-- 3) בידוד העסקים מובטח ב-DB. הגבלות לפי תפקיד (למשל אחזקה רואה רק תקלות)
--    נאכפות בשכבת האפליקציה — אפשר להדק גם כאן בהמשך אם תרצה.
-- ============================================================================
