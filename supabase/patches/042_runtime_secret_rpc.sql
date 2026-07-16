-- Allow edge functions (service_role) to read private.runtime_secrets via RPC
-- even when the private schema is not exposed to PostgREST.
create or replace function public.read_runtime_secret(p_key text)
returns text
language plpgsql
security definer
set search_path = private, public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not allowed';
  end if;
  return (select value from private.runtime_secrets where key = p_key);
end;
$$;

revoke all on function public.read_runtime_secret(text) from public;
revoke all on function public.read_runtime_secret(text) from anon, authenticated;
grant execute on function public.read_runtime_secret(text) to service_role;
