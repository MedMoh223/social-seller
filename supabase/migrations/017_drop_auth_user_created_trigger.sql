-- The default Supabase quickstart creates an on_auth_user_created trigger
-- on auth.users that calls handle_new_user(), attempting to INSERT into
-- public.users with an `email` column that does not exist in our schema.
-- Our public.users is provisioned by handle_new_tenant() (003_tenant_profile_setup.sql)
-- which fires on tenants INSERT and has the correct column set.
-- Drop the conflicting trigger to unblock auth.admin.createUser calls.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();
