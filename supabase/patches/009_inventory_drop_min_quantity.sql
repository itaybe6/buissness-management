-- הסרת כמות מינימום מטבלת inventory_items
alter table public.inventory_items drop column if exists min_quantity;
