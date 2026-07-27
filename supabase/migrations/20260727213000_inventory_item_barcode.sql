-- ברקוד אופציונלי למוצרי מלאi

alter table public.inventory_items
  add column if not exists barcode text;

comment on column public.inventory_items.barcode is 'ברקוד מוצר — אופציונלי, ייחודי לכל עסק';

create unique index if not exists idx_inv_items_business_barcode
  on public.inventory_items (business_id, lower(trim(barcode)))
  where barcode is not null and trim(barcode) <> '';
