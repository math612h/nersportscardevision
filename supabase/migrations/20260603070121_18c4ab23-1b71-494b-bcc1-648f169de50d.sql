
-- Remove dummy users and orphan leaderboard entries
DELETE FROM public.entries WHERE user_id::text LIKE '11111111-1111-1111-1111-%';
DELETE FROM public.division_absences WHERE user_id::text LIKE '11111111-1111-1111-1111-%';
DELETE FROM public.leaderboard_times WHERE user_id::text LIKE '11111111-1111-1111-1111-%' OR uploaded_by::text LIKE '11111111-1111-1111-1111-%';
DELETE FROM public.user_roles WHERE user_id::text LIKE '11111111-1111-1111-1111-%';
DELETE FROM public.profiles WHERE id::text LIKE '11111111-1111-1111-1111-%';
DELETE FROM auth.users WHERE id::text LIKE '11111111-1111-1111-1111-%';

-- Remove leaderboard rows for drivers who are not registered users of the app
DELETE FROM public.leaderboard_times WHERE user_id IS NULL;

-- Disallow null user_id going forward so only known users can be on the leaderboard
ALTER TABLE public.leaderboard_times ALTER COLUMN user_id SET NOT NULL;
