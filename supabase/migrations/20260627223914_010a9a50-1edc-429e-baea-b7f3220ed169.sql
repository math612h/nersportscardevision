
DO $$ BEGIN
  CREATE TYPE public.coaching_booking_status AS ENUM ('pending','confirmed','rejected','cancelled','completed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.coach_profiles (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  bio text,
  specialties text[] NOT NULL DEFAULT '{}',
  achievements text[] NOT NULL DEFAULT '{}',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coach_profiles TO authenticated;
GRANT ALL ON public.coach_profiles TO service_role;
ALTER TABLE public.coach_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "coach_profiles read all auth" ON public.coach_profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "coach_profiles owner insert" ON public.coach_profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND private.has_role(auth.uid(),'coach'::public.app_role));
CREATE POLICY "coach_profiles owner update" ON public.coach_profiles FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR private.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK (auth.uid() = user_id OR private.has_role(auth.uid(),'admin'::public.app_role));
CREATE POLICY "coach_profiles admin delete" ON public.coach_profiles FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(),'admin'::public.app_role));

CREATE TRIGGER coach_profiles_touch BEFORE UPDATE ON public.coach_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.coach_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  weekday smallint,
  specific_date date,
  start_time time NOT NULL,
  end_time time NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((weekday IS NULL) <> (specific_date IS NULL)),
  CHECK (end_time > start_time)
);
CREATE INDEX IF NOT EXISTS coach_availability_coach_idx ON public.coach_availability(coach_user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coach_availability TO authenticated;
GRANT ALL ON public.coach_availability TO service_role;
ALTER TABLE public.coach_availability ENABLE ROW LEVEL SECURITY;

CREATE POLICY "coach_availability read all auth" ON public.coach_availability FOR SELECT TO authenticated USING (true);
CREATE POLICY "coach_availability owner write" ON public.coach_availability FOR ALL TO authenticated
  USING (auth.uid() = coach_user_id OR private.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK (auth.uid() = coach_user_id OR private.has_role(auth.uid(),'admin'::public.app_role));

CREATE TRIGGER coach_availability_touch BEFORE UPDATE ON public.coach_availability
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.coaching_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  focus_points text[] NOT NULL DEFAULT '{}',
  duration_minutes smallint NOT NULL,
  track text NOT NULL,
  layout text,
  starts_at timestamptz NOT NULL,
  extra_info text,
  status public.coaching_booking_status NOT NULL DEFAULT 'pending',
  rejection_reason text,
  discord_channel_id text,
  reminder_sent_at timestamptz,
  coach_notified_message_id text,
  coach_notified_channel_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS coaching_bookings_coach_idx ON public.coaching_bookings(coach_user_id, starts_at);
CREATE INDEX IF NOT EXISTS coaching_bookings_user_idx ON public.coaching_bookings(user_id, starts_at);
CREATE INDEX IF NOT EXISTS coaching_bookings_reminder_idx ON public.coaching_bookings(starts_at) WHERE status = 'confirmed' AND reminder_sent_at IS NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coaching_bookings TO authenticated;
GRANT ALL ON public.coaching_bookings TO service_role;
ALTER TABLE public.coaching_bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "coaching_bookings read participants" ON public.coaching_bookings FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR auth.uid() = coach_user_id OR private.has_role(auth.uid(),'admin'::public.app_role));
CREATE POLICY "coaching_bookings insert by user" ON public.coaching_bookings FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "coaching_bookings update by participants" ON public.coaching_bookings FOR UPDATE TO authenticated
  USING (auth.uid() = coach_user_id OR auth.uid() = user_id OR private.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK (auth.uid() = coach_user_id OR auth.uid() = user_id OR private.has_role(auth.uid(),'admin'::public.app_role));
CREATE POLICY "coaching_bookings delete by admin" ON public.coaching_bookings FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(),'admin'::public.app_role));

CREATE TRIGGER coaching_bookings_touch BEFORE UPDATE ON public.coaching_bookings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
