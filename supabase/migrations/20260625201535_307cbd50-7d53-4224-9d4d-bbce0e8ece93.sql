
-- Backfill car_number + driver_category + user_id into divisions.settings.results
-- so team standings can group correctly. Looks up via entries by driver_name → profile.
WITH enriched AS (
  SELECT d.id AS division_id,
         jsonb_agg(
           CASE WHEN e.car_number IS NULL THEN row_data
                ELSE row_data
                     || jsonb_build_object(
                          'car_number', e.car_number,
                          'driver_category', e.driver_category,
                          'user_id', e.user_id
                        )
           END
           ORDER BY (row_data->>'position')::int
         ) AS new_results
    FROM divisions d
    CROSS JOIN LATERAL jsonb_array_elements(d.settings->'results') AS row_data
    LEFT JOIN profiles p ON lower(trim(coalesce(p.lmu_name, p.display_name, ''))) = lower(trim(row_data->>'driver_name'))
    LEFT JOIN entries e
      ON e.league_id = d.league_id
     AND e.user_id = p.id
     AND e.car_class = row_data->>'car_class'
   WHERE d.settings ? 'results'
     AND jsonb_typeof(d.settings->'results') = 'array'
   GROUP BY d.id
)
UPDATE divisions d
   SET settings = jsonb_set(d.settings, '{results}', enriched.new_results, false)
  FROM enriched
 WHERE d.id = enriched.division_id;
