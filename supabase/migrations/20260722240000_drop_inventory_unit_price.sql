-- מחירי רכש מוגדרים לפי ספק (supplier_items), לא על הפריט עצמו
alter table public.inventory_items drop column if exists unit_price;
