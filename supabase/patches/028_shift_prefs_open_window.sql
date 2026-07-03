-- ============================================================================
-- 028: חלון פתיחה להגשת זמינות לשבוע הבא
-- shift_prefs_open_dow / shift_prefs_open_time: מתי נפתח (יום+שעה; null = פתוח מההתחלה)
-- shift_prefs_deadline_dow / shift_prefs_deadline_time: מתי נסגר (קיים)
-- ============================================================================

alter table public.businesses
  add column if not exists shift_prefs_open_dow smallint
    check (shift_prefs_open_dow is null or (shift_prefs_open_dow >= 0 and shift_prefs_open_dow <= 6)),
  add column if not exists shift_prefs_open_time time default '21:00';
