-- כמות מינימום לכל פריט מלאי (סף התראה על מלאי נמוך)
alter table public.inventory_items
  add column if not exists min_quantity numeric(12,2) not null default 0;

comment on column public.inventory_items.min_quantity is 'כמות מינימום — מתחת לסף זה הפריט מסומן כמלאי נמוך';
