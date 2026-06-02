-- Enums
CREATE TYPE public.protest_status AS ENUM ('open', 'ruled');
CREATE TYPE public.verdict_outcome AS ENUM ('no_penalty', 'warning', 'time_penalty', 'position_penalty', 'disqualified');

-- Extend protests
ALTER TABLE public.protests
  ADD COLUMN status public.protest_status NOT NULL DEFAULT 'open',
  ADD COLUMN verdict_outcome public.verdict_outcome,
  ADD COLUMN verdict_reason text,
  ADD COLUMN verdict_details jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN ruled_by uuid,
  ADD COLUMN ruled_at timestamptz;

-- protest_involved table
CREATE TABLE public.protest_involved (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  protest_id uuid NOT NULL REFERENCES public.protests(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  driver_name text NOT NULL,
  response text,
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (protest_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.protest_involved TO authenticated;
GRANT ALL ON public.protest_involved TO service_role;

ALTER TABLE public.protest_involved ENABLE ROW LEVEL SECURITY;

-- Helper: is current user part of a protest (submitter or involved)
CREATE OR REPLACE FUNCTION public.user_in_protest(_protest_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.protests p
    WHERE p.id = _protest_id AND p.submitted_by = _user_id
  ) OR EXISTS (
    SELECT 1 FROM public.protest_involved pi
    WHERE pi.protest_id = _protest_id AND pi.user_id = _user_id
  )
$$;

-- protest_involved RLS
CREATE POLICY "Read involved rows if part of protest or admin"
  ON public.protest_involved FOR SELECT TO authenticated
  USING (public.user_in_protest(protest_id, auth.uid()) OR private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Submitter or admin inserts involved rows"
  ON public.protest_involved FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.protests p WHERE p.id = protest_id AND p.submitted_by = auth.uid())
    OR private.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "Involved user updates own response"
  ON public.protest_involved FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Submitter or admin deletes involved rows"
  ON public.protest_involved FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.protests p WHERE p.id = protest_id AND p.submitted_by = auth.uid())
    OR private.has_role(auth.uid(), 'admin'::app_role)
  );

-- Tighten protests SELECT: replace existing policy to include involved users
DROP POLICY IF EXISTS "Users see own protests or admin sees all" ON public.protests;

CREATE POLICY "Submitter, involved, or admin reads protest"
  ON public.protests FOR SELECT TO authenticated
  USING (
    auth.uid() = submitted_by
    OR private.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.protest_involved pi
      WHERE pi.protest_id = id AND pi.user_id = auth.uid()
    )
  );

-- Admin can update protests (for verdict)
CREATE POLICY "Admin updates protests"
  ON public.protests FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));