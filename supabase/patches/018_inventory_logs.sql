-- ============================================================================
-- 018: יומן עדכוני מלאי (inventory_logs)
-- תיעוד מלא של כל פעולה על מוצר במלאי — מי עידכן, מה, ומתי.
-- מאפשר למנהל בקרה: לכל מוצר אפשר לראות את היסטוריית העדכונים שלו
-- (יצירה / עדכון כמות / עריכת פרטים / דיווח בלאי / הזמנה).
-- ============================================================================

-- 1. סוג הפעולה
do $$
begin
  if not exists (select 1 from pg_type where typname = 'inventory_action') then
    create type public.inventory_action as enum (
      'created',   -- נוצר פריט חדש
      'count',     -- עדכון כמות (ספירת מלאי)
      'edited',    -- עריכת פרטי הפריט (שם / יחידה / מינימום / תמונה)
      'waste',     -- דיווח בלאי
      'order'      -- הזמנת סחורה
    );
  end if;
end $$;

-- 2. טבלת היומן
create table if not exists public.inventory_logs (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.businesses(id) on delete cascade,
  item_id       uuid not null references public.inventory_items(id) on delete cascade,
  employee_id   uuid references public.profiles(id),       -- מי ביצע את העדכון
  action        public.inventory_action not null,
  previous_qty  numeric(12,2),                             -- כמות לפני (לעדכוני כמות/בלאי)
  new_qty       numeric(12,2),                             -- כמות אחרי / כמות הפעולה
  note          text,                                      -- פירוט: שדות שהשתנו / סיבת בלאי
  created_at    timestamptz not null default now()
);

comment on table public.inventory_logs is 'יומן עדכוני מלאי — תיעוד מי עידכן מה ומתי, לכל מוצר';

-- 3. אינדקסים
create index if not exists idx_inv_logs_business on public.inventory_logs(business_id);
create index if not exists idx_inv_logs_item     on public.inventory_logs(item_id, created_at desc);

-- 4. RLS — בידוד לפי עסק (כמו שאר טבלאות המלאי)
alter table public.inventory_logs enable row level security;
drop policy if exists "inv_logs_tenant" on public.inventory_logs;
create policy "inv_logs_tenant" on public.inventory_logs
  for all using (public.can_access(business_id)) with check (public.can_access(business_id));
