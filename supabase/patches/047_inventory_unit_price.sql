-- ============================================================================
-- 047: מחיר ליחידת מידה ראשית בפריט מלאi
-- ============================================================================

alter table public.inventory_items
  add column if not exists unit_price numeric(12,2) not null default 0;

comment on column public.inventory_items.unit_price is 'מחיר ליחידת המידה הראשית (unit) — לשימוש מנהל/מנהלת משרד בלבד בממשק';
