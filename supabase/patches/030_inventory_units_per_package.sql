-- כמה יחידים בודדים יש ביחידת המידה הראשית (למשל 24 יחידות בארגז)
alter table public.inventory_items
  add column if not exists units_per_package numeric(12,2) check (units_per_package is null or units_per_package > 0);

comment on column public.inventory_items.units_per_package is 'מספר היחידים הבודדים ביחידת המידה הראשית (למשל 24 חלבונים בארגז). null כשהיחידה היא יחידות.';
