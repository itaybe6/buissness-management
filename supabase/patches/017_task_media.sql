-- ============================================================================
-- 017: מספר תמונות / סרטון למשימה
-- העובד (ובמיוחד איש האחזקה) יכול לצרף כמה תמונות ו/או סרטון בעת הטיפול במשימה,
-- במקביל לשינוי הסטטוס. במקום photo_url בודד — מערך media_urls.
-- ============================================================================

-- 1. מערך מדיה (תמונות + סרטונים). photo_url נשאר לתאימות לאחור אך לא נכתב יותר.
alter table public.tasks
  add column if not exists media_urls text[] not null default '{}';

-- 2. העברת התמונה הקיימת (אם יש) למערך
update public.tasks
set media_urls = array[photo_url]
where photo_url is not null
  and photo_url <> ''
  and (media_urls = '{}' or media_urls is null);

-- 3. הגדלת מגבלת הגודל ל-bucket המשימות כדי לאפשר סרטונים (100MB) — כל סוגי המדיה
update storage.buckets
set file_size_limit = 104857600,
    allowed_mime_types = null
where id = 'tasks';
