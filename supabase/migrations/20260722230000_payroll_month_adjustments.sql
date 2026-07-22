-- התאמות שכר חודשיות ידניות: בונוס חודשי, מפרעה, הפרשים
create table public.payroll_month_adjustments (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references public.businesses(id) on delete cascade,
  employee_id     uuid not null references public.profiles(id) on delete cascade,
  period_month    date not null,
  monthly_bonus   numeric(12,2) not null default 0,
  advance         numeric(12,2) not null default 0 check (advance >= 0),
  differences     numeric(12,2) not null default 0,
  updated_by      uuid references public.profiles(id),
  updated_at      timestamptz not null default now(),
  unique (business_id, employee_id, period_month)
);

create index idx_payroll_month_adj_business on public.payroll_month_adjustments(business_id);
create index idx_payroll_month_adj_period on public.payroll_month_adjustments(business_id, period_month);

alter table public.payroll_month_adjustments enable row level security;

create policy "payroll_month_adj_tenant" on public.payroll_month_adjustments
  for all using (public.can_access(business_id)) with check (public.can_access(business_id));
