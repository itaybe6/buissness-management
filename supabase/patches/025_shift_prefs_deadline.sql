-- ============================================================================
-- 025: מועד אחרון להגשת זמינות לשבוע הבא
-- shift_prefs_deadline_dow: 0=ראשון … 6=שבת (בשבוע הנוכחי)
-- shift_prefs_deadline_time: שעת הסגירה (ברירת מחדל 20:00 כשמוגדר יום)
-- null בשניהם = אין הגבלה
-- ============================================================================

alter table public.businesses
  add column if not exists shift_prefs_deadline_dow smallint
    check (shift_prefs_deadline_dow is null or (shift_prefs_deadline_dow >= 0 and shift_prefs_deadline_dow <= 6)),
  add column if not exists shift_prefs_deadline_time time default '20:00';
