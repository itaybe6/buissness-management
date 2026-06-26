-- Business address text + fixed 100m attendance radius default
alter table public.businesses add column if not exists location_address text;

alter table public.businesses alter column location_radius_m set default 100;

update public.businesses
set location_radius_m = 100
where location_radius_m is null or location_radius_m = 150;
