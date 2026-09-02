CREATE TABLE IF NOT EXISTS public.division_replays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  division_id uuid NOT NULL REFERENCES public.divisions(id) ON DELETE CASCADE,
  server text NOT NULL CHECK (server IN ('pro','am')),
  path text NOT NULL,
  file_name text NOT NULL,
  size_bytes bigint,
  uploaded_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (division_id, server)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.division_replays TO authenticated;
GRANT ALL ON public.division_replays TO service_role;
ALTER TABLE public.division_replays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins og stewards kan se replays"
ON public.division_replays FOR SELECT TO authenticated
USING (private.has_role(auth.uid(), 'admin'::app_role) OR public.is_steward(auth.uid()));

CREATE POLICY "Admins kan uploade replays"
ON public.division_replays FOR INSERT TO authenticated
WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins kan opdatere replays"
ON public.division_replays FOR UPDATE TO authenticated
USING (private.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins kan slette replays"
ON public.division_replays FOR DELETE TO authenticated
USING (private.has_role(auth.uid(), 'admin'::app_role));

-- Fjern fastest lap fra allerede gemte resultater
UPDATE public.league_results lr
SET points = greatest(0, lr.points - sub.pts)
FROM (
  SELECT d.id AS division_id,
         (r->>'user_id')::uuid AS user_id,
         coalesce((l.points_system->>'fastest_lap_points')::numeric, 1) AS pts
  FROM public.divisions d
  JOIN public.leagues l ON l.id = d.league_id
  CROSS JOIN LATERAL jsonb_array_elements(coalesce(d.settings->'results','[]'::jsonb)) r
  WHERE (r->>'fastest_lap')::boolean IS TRUE AND (r->>'user_id') IS NOT NULL
) sub
WHERE lr.division_id = sub.division_id
  AND lr.user_id = sub.user_id
  AND lr.session_type = 'race';

UPDATE public.divisions d
SET settings = jsonb_set(
  d.settings,
  '{results}',
  (
    SELECT coalesce(jsonb_agg(
      CASE WHEN (r->>'fastest_lap')::boolean IS TRUE
        THEN jsonb_set(
               jsonb_set(r, '{fastest_lap}', 'false'::jsonb),
               '{points}',
               to_jsonb(greatest(0, coalesce((r->>'points')::numeric,0) - coalesce((l.points_system->>'fastest_lap_points')::numeric, 1)))
             )
        ELSE jsonb_set(r, '{fastest_lap}', 'false'::jsonb)
      END
      ORDER BY ord
    ), '[]'::jsonb)
    FROM jsonb_array_elements(d.settings->'results') WITH ORDINALITY AS t(r, ord)
  )
)
FROM public.leagues l
WHERE l.id = d.league_id
  AND jsonb_typeof(d.settings->'results') = 'array';

UPDATE public.leagues
SET points_system = jsonb_set(coalesce(points_system, '{}'::jsonb), '{fastest_lap_points}', '0'::jsonb);