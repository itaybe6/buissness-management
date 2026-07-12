-- Weekend includes Thursday (ה׳): Thu–Sat = 3 days; weekdays Sun–Wed = 4 days max
alter table public.businesses
  drop constraint if exists businesses_shift_prefs_min_weekdays_check,
  drop constraint if exists businesses_shift_prefs_min_weekend_check;

alter table public.businesses
  add constraint businesses_shift_prefs_min_weekdays_check
    check (shift_prefs_min_weekdays is null or (shift_prefs_min_weekdays >= 0 and shift_prefs_min_weekdays <= 4)),
  add constraint businesses_shift_prefs_min_weekend_check
    check (shift_prefs_min_weekend is null or (shift_prefs_min_weekend >= 0 and shift_prefs_min_weekend <= 3));

comment on column public.businesses.shift_prefs_min_weekdays is
  'Minimum complete weekday days (Sun–Wed) employees must submit availability for each week. null = no requirement.';
comment on column public.businesses.shift_prefs_min_weekend is
  'Minimum complete weekend days (Thu–Sat) employees must submit availability for each week. null = no requirement.';
