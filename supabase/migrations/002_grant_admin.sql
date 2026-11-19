-- ============================================================================
-- Grant Admin Role to an Existing Supabase Auth User
-- 1. First create the user in Supabase Dashboard -> Authentication -> Users -> Add user
-- 2. Replace 'admin@example.com' below with that user's exact email
-- 3. Run this query once in Supabase SQL Editor
-- ============================================================================

insert into public.admin_users (user_id, email, role)
select id, email, 'admin'
from auth.users
where lower(email) = lower('admin@example.com')
on conflict (user_id) do update
set email = excluded.email,
    role = 'admin';
