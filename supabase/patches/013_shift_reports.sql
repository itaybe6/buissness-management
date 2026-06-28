-- ============================================================================
-- 013: דוח סגירת משמרת (shift_reports) + קישור טיפים + bucket חשבוניות
-- אחראי המשמרת ממלא דוח סיכום משמרת הכולל סגירת קופה, חשבוניות וטיפים.
-- הטיפים נשמרים פר-משמרת ומוזרמים אוטומטית למסך השכר.
-- ============================================================================

-- 1. טבלת הדוחות
create table if not exists public.shift_reports (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references public.businesses(id) on delete cascade,
  report_date     date not null,
  shift_template_id uuid references public.shift_templates(id) on delete set null,
  manager_names   text,
  total_sales     numeric(12,2) not null default 0,
  delivery_sales  numeric(12,2) not null default 0,
  avg_per_diner   numeric(10,2) not null default 0,
  total_tips      numeric(12,2) not null default 0,
  service_pct     numeric(6,2)  not null default 0,
  tips_hourly     numeric(10,2) not null default 0,
  first_release   text,
  energy_level    smallint check (energy_level is null or (energy_level >= 1 and energy_level <= 10)),
  unusual_events  text,
  team_talks      text,
  team_voice      text,
  daily_tasks_done boolean not null default false,
  urgent_inventory text,
  faults_maintenance text,
  extra           jsonb not null default '{}'::jsonb,
  invoice_urls    text[] not null default '{}',
  created_by      uuid references public.profiles(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.shift_reports
  drop constraint if exists shift_reports_business_date_shift_unique;
alter table public.shift_reports
  add constraint shift_reports_business_date_shift_unique
  unique (business_id, report_date, shift_template_id);

-- 2. קישור טיפים לדוח (מאפשר סנכרון/מחיקה בעת עריכה חוזרת)
alter table public.tips
  add column if not exists shift_report_id uuid references public.shift_reports(id) on delete cascade;

-- 3. אינדקסים
create index if not exists idx_shift_reports_business on public.shift_reports(business_id);
create index if not exists idx_shift_reports_date     on public.shift_reports(business_id, report_date);
create index if not exists idx_tips_shift_report       on public.tips(shift_report_id);

-- 4. עדכון updated_at אוטומטי
drop trigger if exists trg_shift_reports_updated on public.shift_reports;
create trigger trg_shift_reports_updated
  before update on public.shift_reports
  for each row execute function public.set_updated_at();

-- 5. RLS — בידוד לפי עסק (כמו שאר הטבלאות)
alter table public.shift_reports enable row level security;
drop policy if exists "shift_reports_tenant" on public.shift_reports;
create policy "shift_reports_tenant" on public.shift_reports
  for all using (public.can_access(business_id)) with check (public.can_access(business_id));

-- 6. פיצ'ר חדש לעסקים קיימים: דוח סגירת משמרת (מופעל כברירת מחדל)
insert into public.business_features (business_id, feature_key, enabled)
select b.id, 'shift_reports', true
from public.businesses b
on conflict (business_id, feature_key) do nothing;

-- 7. bucket לחשבוניות (Storage). public read, כתיבה למשתמשים מחוברים.
insert into storage.buckets (id, name, public)
values ('invoices', 'invoices', true)
on conflict (id) do nothing;

drop policy if exists "invoices_public_read" on storage.objects;
create policy "invoices_public_read" on storage.objects
  for select using (bucket_id = 'invoices');

drop policy if exists "invoices_auth_insert" on storage.objects;
create policy "invoices_auth_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'invoices');

drop policy if exists "invoices_auth_update" on storage.objects;
create policy "invoices_auth_update" on storage.objects
  for update to authenticated using (bucket_id = 'invoices');

drop policy if exists "invoices_auth_delete" on storage.objects;
create policy "invoices_auth_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'invoices');
