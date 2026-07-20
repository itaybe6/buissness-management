-- כמה יחידות בפועל התקבלו בהזמנה (עשוי להיות קטן מ-quantity)
alter table public.inventory_orders
  add column if not exists received_quantity numeric(12,2);

comment on column public.inventory_orders.received_quantity is
  'כמות שהתקבלה בפועל כשההזמנה סומנה כהגיעה; null לפני קבלה';

-- הזמנות שכבר סומנו כ-received לפני העמודה — נניח שהגיעה כל הכמות שהוזמנה
update public.inventory_orders
set received_quantity = quantity
where status = 'received' and received_quantity is null;
