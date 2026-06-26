-- Task templates (משימות קבועות) + link assignments to templates
-- Run once in Supabase Dashboard → SQL Editor if not applied via MCP migration

create table if not exists public.task_templates (
  id                 uuid primary key default gen_random_uuid(),
  business_id        uuid not null references public.businesses(id) on delete cascade,
  title              text not null,
  description        text,
  recurrence_weekday smallint check (recurrence_weekday is null or (recurrence_weekday >= 0 and recurrence_weekday <= 6)),
  active             boolean not null default true,
  sort_order         integer not null default 0,
  created_at         timestamptz not null default now()
);

create index if not exists idx_task_templates_business on public.task_templates(business_id);

alter table public.task_templates enable row level security;

drop policy if exists "task_templates_tenant" on public.task_templates;
create policy "task_templates_tenant" on public.task_templates
  for all using (public.can_access(business_id)) with check (public.can_access(business_id));

alter table public.tasks add column if not exists template_id uuid references public.task_templates(id) on delete set null;

create index if not exists idx_tasks_template on public.tasks(template_id);
