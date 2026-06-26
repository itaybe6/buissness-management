-- Create departments + shift_templates tables (missing from older remote schema)
-- Run once in Supabase Dashboard → SQL Editor if not applied via MCP migration

create table if not exists public.departments (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name        text not null,
  color       text default '#7c3aed',
  sort_order  integer not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create index if not exists idx_departments_business on public.departments(business_id);

alter table public.departments enable row level security;

drop policy if exists "departments_tenant" on public.departments;
create policy "departments_tenant" on public.departments
  for all using (public.can_access(business_id)) with check (public.can_access(business_id));

create table if not exists public.shift_templates (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name        text not null,
  start_time  time not null,
  end_time    time not null,
  color       text default '#7c3aed',
  active      boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists idx_shift_templates_business on public.shift_templates(business_id);

alter table public.shift_templates enable row level security;

drop policy if exists "shift_templates_tenant" on public.shift_templates;
create policy "shift_templates_tenant" on public.shift_templates
  for all using (public.can_access(business_id)) with check (public.can_access(business_id));

alter table public.profiles add column if not exists department_id uuid references public.departments(id) on delete set null;

create index if not exists idx_profiles_department on public.profiles(department_id);
