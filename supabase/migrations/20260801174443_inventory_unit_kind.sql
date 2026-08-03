-- Unit classification + named inner unit
--
-- Until now the only "single" unit was «יחידות»; every other unit was implicitly a
-- package that had to be broken down into unnamed «יח׳». That forced nonsense on
-- products whose unit already IS the single item (בקבוק) or a continuous measure (ק״ג).
--
-- inventory_units.kind separates the two axes:
--   single  — one countable item (יחידה, בקבוק, פחית, שקית)
--   package — a container holding N single items (ארגז, מארז, שישייה)
--   measure — a continuous measure, never split into pieces (ק״ג, ליטר)
--
-- inventory_items.piece_unit names the item inside a package, so the second level
-- reads "1 ארגז = 24 בקבוק" instead of a generic "יח׳".

alter table public.inventory_units
  add column if not exists kind text not null default 'single';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'inventory_units_kind_check'
  ) then
    alter table public.inventory_units
      add constraint inventory_units_kind_check
      check (kind in ('single', 'package', 'measure'));
  end if;
end $$;

comment on column public.inventory_units.kind is
  'single = פריט בודד | package = מארז שמכיל יחידים | measure = מידה רציפה ללא פירוק';
comment on column public.inventory_units.is_base is
  'נשמר לתאימות לאחור — הסיווג האמיתי נמצא בעמודה kind';

-- Continuous measures: never broken into pieces.
update public.inventory_units
set kind = 'measure'
where translate(lower(trim(name)), '"''״׳ .-', '') in (
  'קג', 'קילו', 'קילוגרם', 'קילוגרמים',
  'גרם', 'גר', 'גרמים',
  'ליטר', 'ליטרים', 'ל',
  'מל', 'מיליליטר', 'סמק', 'קוב',
  'טון', 'מטר', 'מטרים'
);

-- Containers, by name.
update public.inventory_units
set kind = 'package'
where kind <> 'measure'
  and translate(lower(trim(name)), '"''״׳ .-', '') in (
    'ארגז', 'ארגזים', 'מארז', 'מארזים',
    'שישייה', 'שישיה', 'קרטון', 'קרטונים',
    'מגש', 'מגשים', 'תבנית', 'תבניות',
    'משטח', 'תריסר', 'חבילה', 'חבילות'
  );

-- Containers, by evidence: any unit already used with a pack size really is a package.
update public.inventory_units u
set kind = 'package'
where u.kind <> 'package'
  and exists (
    select 1
    from public.inventory_items i
    where i.business_id = u.business_id
      and lower(trim(i.unit)) = lower(trim(u.name))
      and coalesce(i.units_per_package, 0) > 0
  );

-- The base unit is always a single item.
update public.inventory_units set kind = 'single' where is_base and kind <> 'single';

alter table public.inventory_items
  add column if not exists piece_unit text;

comment on column public.inventory_items.piece_unit is
  'שם היחיד הבודד בתוך המארז (בקבוק, שקית). רלוונטי רק כאשר units_per_package מוגדר';
comment on column public.inventory_items.units_per_package is
  'כמה יחידים בודדים יש במארז אחד. null = למוצר אין פירוק דו-שכבתי';

-- Preserve today's behaviour for products that genuinely have a pack breakdown.
update public.inventory_items
set piece_unit = 'יחידות'
where piece_unit is null
  and coalesce(units_per_package, 0) > 0;

-- A named inner unit is meaningless without a pack size.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'inventory_items_piece_unit_needs_pack'
  ) then
    alter table public.inventory_items
      add constraint inventory_items_piece_unit_needs_pack
      check (piece_unit is null or units_per_package is not null);
  end if;
end $$;
