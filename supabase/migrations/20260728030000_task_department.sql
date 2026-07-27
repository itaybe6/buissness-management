-- שיוך משימה למחלקה — משימה אחת משותפת לכל המחלקה (במקום העתק לכל עובד)

alter table public.tasks
  add column if not exists department_id uuid references public.departments(id) on delete cascade;

create index if not exists idx_tasks_department_id on public.tasks (business_id, department_id)
  where department_id is not null;

comment on column public.tasks.department_id is 'מחלקה שאליה שויכה המשימה (assigned_to null = משימה אחת לכל המחלקה)';

-- tasks_update: כל עובד במחלקה יכול לעדכן משימה שמשויכת למחלקה שלו
drop policy if exists "tasks_update" on public.tasks;
create policy "tasks_update" on public.tasks
  for update using (
    public.can_access(business_id)
    and (
      public.auth_role() in ('manager', 'shift_manager')
      or assigned_to = auth.uid()
      or (
        assigned_to is null
        and department_id is not null
        and department_id = public.auth_department_id()
      )
    )
  ) with check (public.can_access(business_id));
