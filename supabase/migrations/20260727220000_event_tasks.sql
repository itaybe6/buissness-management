-- משימות המשויכות לאירוע — event_id על tasks + הרשאות למנהלת אירועים

alter table public.tasks
  add column if not exists event_id uuid references public.events(id) on delete cascade;

create index if not exists idx_tasks_event_id on public.tasks (business_id, event_id)
  where event_id is not null;

comment on column public.tasks.event_id is 'אירוע שאליו שייכת המשימה (null = משימה רגילה)';

-- tasks_insert: מנהלת אירועים יכולה ליצור משימות עם event_id
drop policy if exists "tasks_insert" on public.tasks;
create policy "tasks_insert" on public.tasks
  for insert with check (
    public.can_access(business_id)
    and (
      public.auth_role() = 'manager'
      or (
        public.auth_role() = 'event_manager'
        and event_id is not null
      )
      or (template_id is not null and assigned_to = auth.uid())
    )
  );

-- tasks_delete: מנהלת אירועים יכולה למחוק משימות אירוע
drop policy if exists "tasks_delete" on public.tasks;
create policy "tasks_delete" on public.tasks
  for delete using (
    public.can_access(business_id)
    and (
      public.auth_role() = 'manager'
      or (
        public.auth_role() = 'event_manager'
        and event_id is not null
      )
    )
  );
