-- shift_prefs_min_weekdays / shift_prefs_min_weekend: minimum complete days per week
alter table public.businesses
  add column if not exists shift_prefs_min_weekdays smallint
    check (shift_prefs_min_weekdays is null or (shift_prefs_min_weekdays >= 0 and shift_prefs_min_weekdays <= 5)),
  add column if not exists shift_prefs_min_weekend smallint
    check (shift_prefs_min_weekend is null or (shift_prefs_min_weekend >= 0 and shift_prefs_min_weekend <= 2));
