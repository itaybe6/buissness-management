-- מחיר ספק לפי יחידת מידה: ראשית (ארגז/ק"ג) או יחידה בודדת

alter table public.supplier_items
  add column if not exists price_unit text;

update public.supplier_items
set price_unit = 'main'
where price_unit is null;

alter table public.supplier_items
  alter column price_unit set not null;

alter table public.supplier_items
  drop constraint if exists supplier_items_price_unit_check;

alter table public.supplier_items
  add constraint supplier_items_price_unit_check
  check (price_unit in ('main', 'piece'));

alter table public.supplier_items
  drop constraint if exists supplier_items_pkey;

alter table public.supplier_items
  add primary key (supplier_id, item_id, price_unit);

comment on column public.supplier_items.price_unit is 'main = ליחידת מידה ראשית; piece = ליחידה בודדת (כשיש units_per_package)';
comment on table public.supplier_items is 'מחיר מוצר אצל ספק — לפי יחידת מידה (ראשית או יחידה בודדת)';
