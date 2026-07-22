-- Manager approval for maintenance tasks assigned by shift managers.

alter table public.businesses
  add column if not exists maintenance_task_approval boolean not null default false;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'task_approval') then
    create type public.task_approval as enum ('pending', 'approved');
  end if;
end$$;

alter table public.tasks
  add column if not exists approval_status public.task_approval;

create index if not exists idx_tasks_approval
  on public.tasks(business_id, approval_status)
  where approval_status is not null;
