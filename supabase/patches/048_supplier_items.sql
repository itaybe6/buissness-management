-- ============================================================================
-- 048: מוצרים ומחירים לפי ספק
-- ============================================================================

create table if not exists public.supplier_items (
  business_id   uuid not null references public.businesses(id) on delete cascade,
  supplier_id   uuid not null references public.suppliers(id) on delete cascade,
  item_id       uuid not null references public.inventory_items(id) on delete cascade,
  unit_price    numeric(12,2) not null check (unit_price >= 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (supplier_id, item_id)
);

comment on table public.supplier_items is 'מחיר ליחידת מידה ראשית של מוצר מסוים אצל ספק מסוים';

create index if not exists idx_supplier_items_business on public.supplier_items(business_id);
create index if not exists idx_supplier_items_item on public.supplier_items(item_id);

drop trigger if exists supplier_items_updated_at on public.supplier_items;
create trigger supplier_items_updated_at
  before update on public.supplier_items
  for each row execute function public.set_updated_at();

alter table public.supplier_items enable row level security;
drop policy if exists "supplier_items_tenant" on public.supplier_items;
create policy "supplier_items_tenant" on public.supplier_items
  for all using (public.can_access(business_id)) with check (public.can_access(business_id));
