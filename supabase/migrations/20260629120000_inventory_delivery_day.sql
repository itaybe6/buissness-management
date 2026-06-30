-- inventory: min_quantity + supplier_delivery_day
alter table public.inventory_items
  add column if not exists min_quantity numeric(12,2) not null default 0;

comment on column public.inventory_items.min_quantity is 'כמות מינימום — מתחת לסף זה הפריט מסומן כמלאי נמוך';

alter table public.inventory_items
  add column if not exists supplier_delivery_day smallint check (supplier_delivery_day between 0 and 6);

comment on column public.inventory_items.supplier_delivery_day is 'יום בשבוע שבו הסחורה אמורה להגיע מהספק (0=ראשון, 6=שבת)';
