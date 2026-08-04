-- בעיות שכר — דיווח עובדים וטיפול מנהלת משרד
create type public.salary_issue_status as enum ('open', 'in_treatment', 'closed');

create table public.salary_issues (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references public.businesses(id) on delete cascade,
  employee_id       uuid not null references public.profiles(id) on delete cascade,
  category          text not null,
  description       text not null,
  status            public.salary_issue_status not null default 'open',
  status_updated_by uuid references public.profiles(id) on delete set null,
  status_updated_at timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index idx_salary_issues_business on public.salary_issues(business_id);
create index idx_salary_issues_employee on public.salary_issues(business_id, employee_id);
create index idx_salary_issues_status on public.salary_issues(business_id, status, created_at desc);

comment on table public.salary_issues is 'בעיות שכר שעובדים מדווחים — מנהלת משרד מעדכנת סטטוס';

alter table public.salary_issues enable row level security;

-- עובדים רואים רק את הבעיות שלהם; מנהל/מנהלת משרד רואים הכל בעסק
create policy "salary_issues_select" on public.salary_issues
  for select using (
    public.can_access(business_id)
    and (
      public.auth_role() in ('manager', 'office_manager')
      or employee_id = auth.uid()
    )
  );

-- כל עובד בעסק יכול לפתוח בעיה בשמו
create policy "salary_issues_insert" on public.salary_issues
  for insert with check (
    public.can_access(business_id)
    and employee_id = auth.uid()
  );

-- רק מנהל/מנהלת משרד מעדכנים סטטוס
create policy "salary_issues_update" on public.salary_issues
  for update using (
    public.can_access(business_id)
    and public.auth_role() in ('manager', 'office_manager')
  ) with check (
    public.can_access(business_id)
    and public.auth_role() in ('manager', 'office_manager')
  );
