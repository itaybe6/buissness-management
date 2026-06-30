-- ============================================================================
-- 014: בלאי מלאי (inventory_waste)
-- כל משתמש יכול לדווח על בלאי: סוג מוצר + כמות שהתבזבזה/נפסלה.
-- בעת הדיווח אפשר לבחור להוריד את הכמות מהמלאי (נרשם כספירת מלאי חדשה).
-- ============================================================================

-- 1. טבלת דיווחי הבלאי
create table if not exists public.inventory_waste (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.businesses(id) on delete cascade,
  item_id       uuid not null references public.inventory_items(id) on delete cascade,
  employee_id   uuid references public.profiles(id),
  quantity      numeric(12,2) not null default 0,
  note          text,                                   -- סיבת הבלאי (אופציונלי)
  deducted      boolean not null default false,         -- האם הופחת מהמלאי
  created_at    timestamptz not null default now()
);

comment on table public.inventory_waste is 'דיווחי בלאי — מוצרים שנפסלו/התבזבזו. ניתן להפחית מהמלאי בעת הדיווח';

-- 2. אינדקסים
create index if not exists idx_inv_waste_business on public.inventory_waste(business_id);
create index if not exists idx_inv_waste_item     on public.inventory_waste(item_id);

-- 3. RLS — בידוד לפי עסק (כמו שאר טבלאות המלאי)
alter table public.inventory_waste enable row level security;
drop policy if exists "inv_waste_tenant" on public.inventory_waste;
create policy "inv_waste_tenant" on public.inventory_waste
  for all using (public.can_access(business_id)) with check (public.can_access(business_id));

-- 4. פיצ'ר חדש לעסקים קיימים: בלאי (מופעל כברירת מחדל)
insert into public.business_features (business_id, feature_key, enabled)
select b.id, 'waste', true
from public.businesses b
on conflict (business_id, feature_key) do nothing;
