-- Pension enrollment flag per employee (for payroll export and HR records).

alter table public.profiles
  add column if not exists pension_active boolean not null default false;

comment on column public.profiles.pension_active is
  'האם לעובד פנסיה פעילה (לדיווח שכר וייצוא)';

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
    coalesce((new.raw_user_meta_data->>'hourly_rate')::numeric, 0),
    coalesce(new.raw_user_meta_data->>'wage_type', 'hourly'),
    coalesce((new.raw_user_meta_data->>'pension_active')::boolean, false)
  );
  return new;
end; $$;
