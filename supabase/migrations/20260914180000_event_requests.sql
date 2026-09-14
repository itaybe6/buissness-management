-- בקשות מנהלת אירועים למנהל: שיבוץ עובדים לאירוע ורשימת מצרכים לאירוע.
-- כל בקשה שייכת לאירוע, נפתחת ע״י מנהל/מנהלת אירועים, ומטופלת ע״י המנהל.

create type public.event_request_kind as enum ('staffing', 'supplies');
create type public.event_request_status as enum ('open', 'in_treatment', 'closed');

create table public.event_requests (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references public.businesses(id) on delete cascade,
  event_id          uuid not null references public.events(id) on delete cascade,
  requested_by      uuid references public.profiles(id) on delete set null,
  kind              public.event_request_kind not null,
  status            public.event_request_status not null default 'open',
  -- שיבוץ: תיאור המשמרת (למשל "ערב, הגעה 18:00"); מצרכים: לא בשימוש
  shift_label       text,
  note              text,
  -- שיבוץ: [{department_id, label, count}] ; מצרכים: [{item_id, name, quantity, unit}]
  lines             jsonb not null default '[]'::jsonb,
  status_updated_by uuid references public.profiles(id) on delete set null,
  status_updated_at timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint event_requests_lines_is_array check (jsonb_typeof(lines) = 'array')
);

create index idx_event_requests_business on public.event_requests(business_id, status, created_at desc);
create index idx_event_requests_event    on public.event_requests(business_id, event_id, created_at desc);

comment on table public.event_requests is 'בקשות מנהלת אירועים למנהל — שיבוץ עובדים ורשימת מצרכים לאירוע';

alter table public.event_requests enable row level security;

-- קריאה: מנהל, אחראי משמרת, מנהלת משרד ומנהלת אירועים בעסק
create policy "event_requests_select" on public.event_requests
  for select using (
    public.can_access(business_id)
    and public.auth_role() in ('manager', 'shift_manager', 'office_manager', 'event_manager')
  );

-- פתיחת בקשה: מנהל / מנהלת אירועים, תמיד בשם המשתמש המחובר
create policy "event_requests_insert" on public.event_requests
  for insert with check (
    public.can_access(business_id)
    and public.auth_role() in ('manager', 'event_manager')
    and requested_by = auth.uid()
  );

-- עדכון סטטוס: צוות הניהול
create policy "event_requests_update" on public.event_requests
  for update using (
    public.can_access(business_id)
    and public.auth_role() in ('manager', 'shift_manager', 'office_manager')
  ) with check (
    public.can_access(business_id)
    and public.auth_role() in ('manager', 'shift_manager', 'office_manager')
  );

-- מחיקה: המנהל, או מי שפתח את הבקשה
create policy "event_requests_delete" on public.event_requests
  for delete using (
    public.can_access(business_id)
    and (public.auth_role() = 'manager' or requested_by = auth.uid())
  );

-- מנהלת אירועים בוחרת מצרכים מתוך קטלוג המוצרים — צריכה לקרוא את כל הפריטים
drop policy if exists "inv_items_read" on public.inventory_items;
create policy "inv_items_read" on public.inventory_items
  for select using (
    public.can_access(business_id)
    and (
      public.auth_role() in ('manager', 'shift_manager', 'office_manager', 'event_manager')
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
