-- תעודת זהות לכל עובד — העלאה חובה במודול מסמכים

create table if not exists public.employee_id_cards (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  employee_id uuid not null references public.profiles(id) on delete cascade,
  file_url    text not null,
  file_name   text,
  uploaded_at timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (business_id, employee_id)
);

create index if not exists idx_employee_id_cards_business
  on public.employee_id_cards(business_id);

create trigger trg_employee_id_cards_updated
  before update on public.employee_id_cards
  for each row execute function public.set_updated_at();

alter table public.employee_id_cards enable row level security;

create policy "employee_id_cards_select" on public.employee_id_cards
  for select using (
    public.can_access(business_id)
    and (
      public.auth_role() in ('manager', 'office_manager', 'shift_manager')
      or employee_id = auth.uid()
    )
  );

create policy "employee_id_cards_insert" on public.employee_id_cards
  for insert with check (
    public.can_access(business_id)
    and employee_id = auth.uid()
  );

create policy "employee_id_cards_update" on public.employee_id_cards
  for update using (
    public.can_access(business_id)
    and employee_id = auth.uid()
  ) with check (
    public.can_access(business_id)
    and employee_id = auth.uid()
  );

create policy "employee_id_cards_delete" on public.employee_id_cards
  for delete using (
    public.can_access(business_id)
    and (
      public.auth_role() in ('manager', 'shift_manager')
      or employee_id = auth.uid()
    )
  );

comment on table public.employee_id_cards is
  'סריקת תעודת זהות — חובה לכל עובד; קובץ אחד לעובד לכל עסק';
