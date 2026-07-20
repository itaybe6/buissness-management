-- Default hourly wage for new profiles (₪35.4).

alter table public.profiles
  alter column hourly_rate set default 35.4;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (
    id, email, full_name, business_id, role, department_id, phone, hourly_rate, wage_type, pension_active
  )
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    (new.raw_user_meta_data->>'business_id')::uuid,
    coalesce((new.raw_user_meta_data->>'role')::public.user_role, 'employee'),
    (new.raw_user_meta_data->>'department_id')::uuid,
    new.raw_user_meta_data->>'phone',
    coalesce((new.raw_user_meta_data->>'hourly_rate')::numeric, 35.4),
    coalesce(new.raw_user_meta_data->>'wage_type', 'hourly'),
    coalesce((new.raw_user_meta_data->>'pension_active')::boolean, false)
  );
  return new;
end; $$;
