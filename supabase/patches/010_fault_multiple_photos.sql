-- תמונות מרובות לתקלה: photo_url -> photo_urls[]
alter table public.faults add column if not exists photo_urls text[] not null default '{}';

update public.faults
set photo_urls = array[photo_url]
where photo_url is not null and photo_url <> '';

alter table public.faults drop column if exists photo_url;
