-- ============================================================================
-- 024: מתג אופציונלי לבדיקת רדיוס בהחתמת נוכחות
-- כש-attendance_geofence_enabled דלוק — עובד חייב להיות ברדיוס מהכתובת.
-- כשכבוי — ניתן להחתים נוכחות ללא בדיקת GPS.
-- ============================================================================

alter table public.businesses
  add column if not exists attendance_geofence_enabled boolean not null default true;
