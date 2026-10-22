-- תפקיד חדש: מנהל מחלקה. יש להריץ בנפרד לפני המיגרציה הבאה —
-- PostgreSQL לא מאפשר להשתמש בערך enum חדש באותה טרנזקציה שבה הוא נוסף.
alter type public.user_role add value if not exists 'department_manager';
