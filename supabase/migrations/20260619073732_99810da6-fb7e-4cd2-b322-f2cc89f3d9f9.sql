
CREATE TEMP TABLE _norm_map ON COMMIT DROP AS
SELECT lt.id, lt.user_id, lt.car_class, lt.recorded_at, lt.best_lap_ms,
  CASE
    WHEN lt.track ILIKE 'Algarve%' OR lt.track ILIKE 'Portim%' THEN 'Portimão'
    WHEN lt.track ILIKE '%Enzo e Dino%' OR lt.track = 'Imola' THEN 'Imola'
    WHEN lt.track ILIKE '%Jos% Carlos Pace%' OR lt.track ILIKE '%Jose Carlos Pace%' OR lt.track = 'Interlagos' THEN 'Interlagos'
    WHEN lt.track ILIKE 'Circuit de Barcelona%' OR lt.track = 'Barcelona' THEN 'Barcelona'
    WHEN lt.track ILIKE 'Bahrain%' THEN 'Bahrain'
    WHEN lt.track ILIKE 'Autodromo Nazionale Monza%' OR lt.track = 'Monza' THEN 'Monza'
    WHEN lt.track ILIKE 'Circuit de Spa%' OR lt.track = 'Spa' OR lt.track ILIKE 'Spa-Francorchamps%' THEN 'Spa-Francorchamps'
    WHEN lt.track ILIKE 'Circuit de la Sarthe%' OR lt.track = 'Le Mans' THEN 'Le Mans'
    WHEN lt.track ILIKE 'Circuit of the Americas%' OR lt.track = 'Cota' THEN 'Cota'
    WHEN lt.track ILIKE 'Fuji%' THEN 'Fuji'
    WHEN lt.track ILIKE 'Lusail%' THEN 'Lusail'
    WHEN lt.track ILIKE 'Paul Ricard%' OR lt.track ILIKE 'Circuit Paul Ricard%' THEN 'Paul Ricard'
    WHEN lt.track ILIKE 'Sebring%' THEN 'Sebring'
    WHEN lt.track ILIKE 'Silverstone%' THEN 'Silverstone'
    ELSE lt.track END AS new_track,
  CASE
    WHEN lt.track ILIKE 'Algarve%' OR lt.track ILIKE 'Portim%' THEN 'Portimão'
    WHEN lt.track ILIKE '%Enzo e Dino%' OR lt.track = 'Imola' THEN 'Imola'
    WHEN lt.track ILIKE '%Jos% Carlos Pace%' OR lt.track ILIKE '%Jose Carlos Pace%' OR lt.track = 'Interlagos' THEN 'Interlagos'
    WHEN lt.track ILIKE 'Circuit de Barcelona%' OR lt.track = 'Barcelona' THEN 'Barcelona'
    WHEN lt.track ILIKE 'Bahrain%' AND lt.layout ILIKE 'Outer%' THEN 'Outer'
    WHEN lt.track ILIKE 'Bahrain%' AND lt.layout ILIKE 'Paddock%' THEN 'Paddock'
    WHEN lt.track ILIKE 'Bahrain%' THEN 'Bahrain'
    WHEN (lt.track ILIKE 'Autodromo Nazionale Monza%' OR lt.track = 'Monza') AND (lt.layout ILIKE '%Grande%' OR lt.layout ILIKE '%Curva%') THEN 'Curva Grande'
    WHEN lt.track ILIKE 'Autodromo Nazionale Monza%' OR lt.track = 'Monza' THEN 'Monza'
    WHEN lt.track ILIKE 'Circuit de Spa%' OR lt.track = 'Spa' OR lt.track ILIKE 'Spa-Francorchamps%' THEN 'Grand Prix'
    WHEN (lt.track ILIKE 'Circuit de la Sarthe%' OR lt.track = 'Le Mans') AND lt.layout ILIKE 'Mulsanne%' THEN 'Mulsanne No Chicanes'
    WHEN lt.track ILIKE 'Circuit de la Sarthe%' OR lt.track = 'Le Mans' THEN '24h Circuit'
    WHEN (lt.track ILIKE 'Circuit of the Americas%' OR lt.track = 'Cota') AND lt.layout ILIKE 'National%' THEN 'National'
    WHEN lt.track ILIKE 'Circuit of the Americas%' OR lt.track = 'Cota' THEN 'Circuit of the Americas'
    WHEN lt.track ILIKE 'Fuji%' AND (lt.layout ILIKE 'Cl%' OR lt.layout ILIKE '%Classic%') THEN 'Classic'
    WHEN lt.track ILIKE 'Fuji%' THEN 'Fuji'
    WHEN lt.track ILIKE 'Lusail%' AND lt.layout ILIKE '%Short%' THEN 'Short'
    WHEN lt.track ILIKE 'Lusail%' THEN 'Lusail'
    WHEN lt.track ILIKE '%Paul Ricard%' AND (lt.layout ILIKE '1 AV2 Short%' OR lt.layout ILIKE '1av2-short%' OR lt.layout ILIKE '1av2 short%') THEN '1av2-short'
    WHEN lt.track ILIKE '%Paul Ricard%' AND (lt.layout ILIKE '1 AV2%' OR lt.layout ILIKE '1av2%') THEN '1av2'
    WHEN lt.track ILIKE '%Paul Ricard%' AND (lt.layout ILIKE '1 A%' OR lt.layout = '1a' OR lt.layout ILIKE '3 A%' OR lt.layout = '3a') THEN '1a'
    WHEN lt.track ILIKE '%Paul Ricard%' THEN 'Paul Ricard'
    WHEN lt.track ILIKE 'Sebring%' AND lt.layout ILIKE 'School%' THEN 'School'
    WHEN lt.track ILIKE 'Sebring%' THEN 'Sebring'
    WHEN lt.track ILIKE 'Silverstone%' AND lt.layout ILIKE 'National%' THEN 'National'
    WHEN lt.track ILIKE 'Silverstone%' AND lt.layout = 'International' THEN 'International'
    WHEN lt.track ILIKE 'Silverstone%' THEN 'GP Circuit'
    ELSE lt.layout END AS new_layout
FROM public.leaderboard_times lt;

WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id, new_track, new_layout, car_class, recorded_at ORDER BY best_lap_ms ASC, id ASC) AS rn
  FROM _norm_map
)
DELETE FROM public.leaderboard_times WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

UPDATE public.leaderboard_times lt
   SET track = n.new_track, layout = n.new_layout
  FROM _norm_map n
 WHERE n.id = lt.id
   AND (lt.track IS DISTINCT FROM n.new_track OR lt.layout IS DISTINCT FROM n.new_layout);

CREATE OR REPLACE FUNCTION public.normalize_track_layout(_track text, _layout text)
 RETURNS TABLE(track text, layout text)
 LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public'
AS $function$
DECLARE
  t text := trim(coalesce(_track, ''));
  l text := nullif(trim(coalesce(_layout, '')), '');
BEGIN
  IF t ILIKE 'Algarve%' OR t ILIKE 'Portim%' THEN RETURN QUERY SELECT 'Portimão'::text, 'Portimão'::text; RETURN; END IF;
  IF t ILIKE '%Enzo e Dino%' OR t = 'Imola' THEN RETURN QUERY SELECT 'Imola'::text, 'Imola'::text; RETURN; END IF;
  IF t ILIKE '%Jos% Carlos Pace%' OR t ILIKE '%Jose Carlos Pace%' OR t = 'Interlagos' THEN RETURN QUERY SELECT 'Interlagos'::text, 'Interlagos'::text; RETURN; END IF;
  IF t ILIKE 'Circuit de Barcelona%' OR t = 'Barcelona' THEN RETURN QUERY SELECT 'Barcelona'::text, 'Barcelona'::text; RETURN; END IF;
  IF t ILIKE 'Bahrain%' THEN
    IF l ILIKE 'Outer%' THEN RETURN QUERY SELECT 'Bahrain'::text, 'Outer'::text; RETURN; END IF;
    IF l ILIKE 'Paddock%' THEN RETURN QUERY SELECT 'Bahrain'::text, 'Paddock'::text; RETURN; END IF;
    RETURN QUERY SELECT 'Bahrain'::text, 'Bahrain'::text; RETURN;
  END IF;
  IF t ILIKE 'Autodromo Nazionale Monza%' OR t = 'Monza' THEN
    IF l ILIKE '%Grande%' OR l ILIKE '%Curva%' THEN RETURN QUERY SELECT 'Monza'::text, 'Curva Grande'::text; RETURN; END IF;
    RETURN QUERY SELECT 'Monza'::text, 'Monza'::text; RETURN;
  END IF;
  IF t ILIKE 'Circuit de Spa%' OR t = 'Spa' OR t ILIKE 'Spa-Francorchamps%' THEN RETURN QUERY SELECT 'Spa-Francorchamps'::text, 'Grand Prix'::text; RETURN; END IF;
  IF t ILIKE 'Circuit de la Sarthe%' OR t = 'Le Mans' THEN
    IF l ILIKE 'Mulsanne%' THEN RETURN QUERY SELECT 'Le Mans'::text, 'Mulsanne No Chicanes'::text; RETURN; END IF;
    RETURN QUERY SELECT 'Le Mans'::text, '24h Circuit'::text; RETURN;
  END IF;
  IF t ILIKE 'Circuit of the Americas%' OR t = 'Cota' THEN
    IF l ILIKE 'National%' THEN RETURN QUERY SELECT 'Cota'::text, 'National'::text; RETURN; END IF;
    RETURN QUERY SELECT 'Cota'::text, 'Circuit of the Americas'::text; RETURN;
  END IF;
  IF t ILIKE 'Fuji%' THEN
    IF l ILIKE 'Cl%' OR l ILIKE '%Classic%' THEN RETURN QUERY SELECT 'Fuji'::text, 'Classic'::text; RETURN; END IF;
    RETURN QUERY SELECT 'Fuji'::text, 'Fuji'::text; RETURN;
  END IF;
  IF t ILIKE 'Lusail%' THEN
    IF l ILIKE '%Short%' THEN RETURN QUERY SELECT 'Lusail'::text, 'Short'::text; RETURN; END IF;
    RETURN QUERY SELECT 'Lusail'::text, 'Lusail'::text; RETURN;
  END IF;
  IF t ILIKE '%Paul Ricard%' THEN
    IF l ILIKE '1 AV2 Short%' OR l ILIKE '1av2-short%' OR l ILIKE '1av2 short%' THEN RETURN QUERY SELECT 'Paul Ricard'::text, '1av2-short'::text; RETURN; END IF;
    IF l ILIKE '1 AV2%' OR l ILIKE '1av2%' THEN RETURN QUERY SELECT 'Paul Ricard'::text, '1av2'::text; RETURN; END IF;
    IF l ILIKE '1 A%' OR l = '1a' OR l ILIKE '3 A%' OR l = '3a' THEN RETURN QUERY SELECT 'Paul Ricard'::text, '1a'::text; RETURN; END IF;
    RETURN QUERY SELECT 'Paul Ricard'::text, 'Paul Ricard'::text; RETURN;
  END IF;
  IF t ILIKE 'Sebring%' THEN
    IF l ILIKE 'School%' THEN RETURN QUERY SELECT 'Sebring'::text, 'School'::text; RETURN; END IF;
    RETURN QUERY SELECT 'Sebring'::text, 'Sebring'::text; RETURN;
  END IF;
  IF t ILIKE 'Silverstone%' THEN
    IF l ILIKE 'National%' THEN RETURN QUERY SELECT 'Silverstone'::text, 'National'::text; RETURN; END IF;
    IF l = 'International' THEN RETURN QUERY SELECT 'Silverstone'::text, 'International'::text; RETURN; END IF;
    RETURN QUERY SELECT 'Silverstone'::text, 'GP Circuit'::text; RETURN;
  END IF;
  RETURN QUERY SELECT t, l;
END;
$function$;
