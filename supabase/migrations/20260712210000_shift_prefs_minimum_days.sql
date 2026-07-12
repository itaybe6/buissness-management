-- Minimum availability submission requirements per week
alter table public.businesses
  add column if not exists shift_prefs_min_weekdays smallint
    check (shift_prefs_min_weekdays is null or (shift_prefs_min_weekdays >= 0 and shift_prefs_min_weekdays <= 5)),
  add column if not exists shift_prefs_min_weekend smallint
    check (shift_prefs_min_weekend is null or (shift_prefs_min_weekend >= 0 and shift_prefs_min_weekend <= 2));

comment on column public.businesses.shift_prefs_min_weekdays is
  'Minimum complete weekday days (Sun–Wed) employees must submit availability for each week. null = no requirement.';
comment on column public.businesses.shift_prefs_min_weekend is
  'Minimum complete weekend days (Thu–Sat) employees must submit availability for each week. null = no requirement.';
