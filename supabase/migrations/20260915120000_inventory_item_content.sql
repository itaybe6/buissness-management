-- תכולה מדידה של מוצר מלאי — לתמחור מנות
--
-- כדי שמוצר ייכנס לעץ מנה בגרם / מ״ל, המערכת צריכה לדעת כמה יש בתוך פריט אחד:
--   בקבוק שמן  = 750 מ״ל      → content_qty 750,  content_measure 'ml'
--   שק קמח     = 25,000 גרם   → content_qty 25000, content_measure 'g'
--   ביצה       = נספרת         → content_qty 1,    content_measure 'unit'
--
-- הערך מתאר פריט בודד אחד (או יחידת רכש אחת כשאין פירוק למארז). יחידות שהן
-- בעצמן מידה (ק״ג, ליטר) לא צריכות תכולה — היא נגזרת מהשם.
-- עד עכשיו זה נשמר ב-menu_item_conversions (מודול התפריט); מהיום זו תכונה של
-- המוצר עצמו ומוזנת בטופס המוצר. ההמרות הקיימות מועתקות.

alter table public.inventory_items
  add column if not exists content_qty     numeric(12,3),
  add column if not exists content_measure text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'inventory_items_content_measure_check') then
    alter table public.inventory_items
      add constraint inventory_items_content_measure_check
      check (content_measure is null or content_measure in ('g', 'ml', 'unit'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'inventory_items_content_qty_positive') then
    alter table public.inventory_items
      add constraint inventory_items_content_qty_positive
      check (content_qty is null or content_qty > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'inventory_items_content_pair') then
    alter table public.inventory_items
      add constraint inventory_items_content_pair
      check ((content_qty is null) = (content_measure is null));
  end if;
end $$;

comment on column public.inventory_items.content_qty is
  'כמה יש בתוך פריט בודד אחד (או יחידת רכש אחת ללא מארז), במידה content_measure. משמש לתמחור מנות.';
comment on column public.inventory_items.content_measure is
  'g = גרם | ml = מ״ל | unit = נספר ביחידות (ללא משקל/נפח)';

-- העתקת המרות שכבר הוזנו במודול התפריט
update public.inventory_items i
set content_qty     = c.content_qty,
    content_measure = c.content_measure
from public.menu_item_conversions c
where c.item_id = i.id
  and c.content_qty is not null
  and c.content_measure is not null
  and i.content_qty is null;
