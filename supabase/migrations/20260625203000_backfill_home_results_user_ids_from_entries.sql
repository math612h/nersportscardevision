-- Backfill missing user_id/car metadata in divisions.settings.results using the league entries table.
-- Some older homepage result JSON rows only had driver_name, which made team standings
-- disappear because team points must be matched by lineup user_id.
WITH enriched AS (
  SELECT
    d.id AS division_id,
    jsonb_agg(
      CASE
        WHEN e.user_id IS NULL THEN row_data
        ELSE row_data
          || jsonb_build_object(
            'user_id', COALESCE(row_data->>'user_id', e.user_id::text),
            'car_number', COALESCE((row_data->>'car_number')::int, e.car_number),
            'driver_category', COALESCE(row_data->>'driver_category', e.driver_category)
          )
      END
      ORDER BY ord
    ) AS new_results
  FROM public.divisions d
  CROSS JOIN LATERAL jsonb_array_elements(d.settings->'results') WITH ORDINALITY AS r(row_data, ord)
  LEFT JOIN LATERAL (
    SELECT ent.user_id, ent.car_number, ent.driver_category
    FROM public.entries ent
    WHERE ent.league_id = d.league_id
      AND ent.car_class = row_data->>'car_class'
      AND lower(trim(ent.driver_name)) = lower(trim(row_data->>'driver_name'))
    ORDER BY ent.waitlist ASC, ent.created_at ASC
    LIMIT 1
  ) e ON TRUE
  WHERE d.settings ? 'results'
    AND jsonb_typeof(d.settings->'results') = 'array'
  GROUP BY d.id
)
UPDATE public.divisions d
SET settings = jsonb_set(d.settings, '{results}', enriched.new_results, false)
FROM enriched
WHERE d.id = enriched.division_id;
