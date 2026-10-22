-- מנהל מחלקה מקבל את הרשאות הניהול שהיו לאחמ״ש (סידור, דוחות, מלאי, מסמכים).
-- אחמ״ש נשאר תפקיד, עם גישה כמו עובד (רשומות שלו / המחלקה שלו).

create or replace function public.position_role_rank(r public.user_role)
returns integer language sql immutable as $$
  select case r
    when 'super_admin'         then 0
    when 'manager'             then 1
    when 'office_manager'      then 2
    when 'department_manager'  then 3
    when 'event_manager'       then 4
    when 'shift_manager'       then 5
    when 'employee'            then 6
    when 'maintenance'         then 7
    else 9
  end
$$;

do $$
declare
  pol record;
  cmd_sql text;
  using_sql text;
  check_sql text;
  stmt text;
begin
  for pol in
    select
      n.nspname,
      c.relname,
      p.polname,
      p.polcmd,
      pg_get_expr(p.polqual, p.polrelid) as using_expr,
      pg_get_expr(p.polwithcheck, p.polrelid) as check_expr
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and (
        coalesce(pg_get_expr(p.polqual, p.polrelid), '') like '%shift_manager%'
        or coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') like '%shift_manager%'
      )
  loop
    execute format('drop policy %I on %I.%I', pol.polname, pol.nspname, pol.relname);

    cmd_sql := case pol.polcmd
      when 'r' then 'select'
      when 'a' then 'insert'
      when 'w' then 'update'
      when 'd' then 'delete'
      else 'all'
    end;

    using_sql := replace(pol.using_expr, '''shift_manager''::user_role', '''department_manager''::user_role');
    check_sql := replace(pol.check_expr, '''shift_manager''::user_role', '''department_manager''::user_role');

    stmt := format(
      'create policy %I on %I.%I as permissive for %s to public',
      pol.polname, pol.nspname, pol.relname, cmd_sql
    );
    if using_sql is not null then
      stmt := stmt || ' using (' || using_sql || ')';
    end if;
    if check_sql is not null then
      stmt := stmt || ' with check (' || check_sql || ')';
    end if;
    execute stmt;
  end loop;
end $$;
