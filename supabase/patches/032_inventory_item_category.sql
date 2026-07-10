-- קטגוריית מוצר במלאי
alter table public.inventory_items
  add column if not exists category text;

comment on column public.inventory_items.category is 'קטגוריית המוצר (חלבי, אלכוהול, יבשים וכו׳)';

create index if not exists idx_inv_items_category on public.inventory_items(business_id, category);
