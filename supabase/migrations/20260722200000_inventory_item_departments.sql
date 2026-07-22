-- שיוך מוצרי מלאי למחלקות (many-to-many). מוצר ללא שורות = גלוי לכל המחלקות.

create table if not exists public.inventory_item_departments (
  business_id   uuid not null references public.businesses(id) on delete cascade,
  item_id       uuid not null references public.inventory_items(id) on delete cascade,
  department_id uuid not null references public.departments(id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (item_id, department_id)
);

create index if not exists idx_inv_item_depts_business on public.inventory_item_departments(business_id);
create index if not exists idx_inv_item_depts_department on public.inventory_item_departments(department_id);

comment on table public.inventory_item_departments is 'מחלקות שרואות/משתמשות במוצר מלאי; ללא שורות = כל המחלקות';

create or replace function public.auth_department_id()
returns uuid language sql stable security definer set search_path = public as $$
  select department_id from public.profiles where id = auth.uid()
$$;

alter table public.inventory_item_departments enable row level security;

drop policy if exists "inv_item_depts_read" on public.inventory_item_departments;
create policy "inv_item_depts_read" on public.inventory_item_departments
  for select using (public.can_access(business_id));

drop policy if exists "inv_item_depts_manager_write" on public.inventory_item_departments;
create policy "inv_item_depts_manager_write" on public.inventory_item_departments
  for all using (
    public.can_access(business_id)
    and public.auth_role() in ('manager', 'shift_manager', 'office_manager')
  ) with check (
    public.can_access(business_id)
    and public.auth_role() in ('manager', 'shift_manager', 'office_manager')
  );

-- סינון קריאת מוצרים לפי מחלקת העובד (מנהלים רואים הכל)
drop policy if exists "inv_items_read" on public.inventory_items;
create policy "inv_items_read" on public.inventory_items
  for select using (
    public.can_access(business_id)
    and (
      public.auth_role() in ('manager', 'shift_manager', 'office_manager')
      or not exists (
        select 1 from public.inventory_item_departments d
        where d.item_id = inventory_items.id
      )
      or exists (
        select 1 from public.inventory_item_departments d
        where d.item_id = inventory_items.id
          and d.department_id = public.auth_department_id()
      )
    )
  );
