-- ============================================================================
-- 033: תוספת שכר מאחוז קופה — shift_bonuses
-- עובדים נבחרים בדוח משמרת מקבלים חלק שווה מ-(total_sales × service_pct / 100)
-- ============================================================================

create table if not exists public.shift_bonuses (
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

create index if not exists idx_shift_bonuses_business on public.shift_bonuses(business_id);
create index if not exists idx_shift_bonuses_employee on public.shift_bonuses(business_id, employee_id, shift_date);
create index if not exists idx_shift_bonuses_report on public.shift_bonuses(shift_report_id);

alter table public.shift_bonuses enable row level security;

drop policy if exists "shift_bonuses_tenant" on public.shift_bonuses;
create policy "shift_bonuses_tenant" on public.shift_bonuses
  for all using (public.can_access(business_id)) with check (public.can_access(business_id));

comment on table public.shift_bonuses is
  'תוספת שכר לעובדים נבחרים — אחוז מסכום הקופה (total_sales × service_pct), מחולק שווה בין הנבחרים';
