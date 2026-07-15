-- שלב 1: תפקיד חדש (יש להריץ בנפרד לפני שלב 2 — PostgreSQL דורש commit לערך enum חדש)
alter type public.user_role add value if not exists 'event_manager';
