
CREATE OR REPLACE FUNCTION public.normalize_track_layout(_track text, _layout text)
RETURNS TABLE(track text, layout text)
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  t text := trim(coalesce(_track, ''));
  l text := nullif(trim(coalesce(_layout, '')), '');
BEGIN
  -- Track + layout consolidation
  IF t ILIKE 'Algarve%' THEN RETURN QUERY SELECT 'Portimao'::text, 'Full Circuit'::text; RETURN; END IF;
  IF t ILIKE 'Autodromo Enzo%' OR t ILIKE 'Autódromo Enzo%' OR t ILIKE '%Enzo e Dino Ferrari%' THEN RETURN QUERY SELECT 'Imola'::text, 'Grand Prix'::text; RETURN; END IF;
  IF t ILIKE '%José Carlos Pace%' OR t ILIKE '%Jose Carlos Pace%' THEN RETURN QUERY SELECT 'Interlagos'::text, 'Grand Prix'::text; RETURN; END IF;
  IF t ILIKE 'Circuit de Barcelona%' OR t = 'Barcelona' THEN RETURN QUERY SELECT 'Barcelona'::text, 'Grand Prix'::text; RETURN; END IF;
  IF t ILIKE 'Circuit de Spa%' OR t = 'Spa' OR t ILIKE 'Spa-Francorchamps%' THEN RETURN QUERY SELECT 'Spa'::text, 'Grand Prix'::text; RETURN; END IF;
  IF t ILIKE 'Sebring International%' OR t = 'Sebring' THEN
    IF l ILIKE 'School%' THEN RETURN QUERY SELECT 'Sebring'::text, 'School'::text; RETURN; END IF;
    RETURN QUERY SELECT 'Sebring'::text, 'Sebring'::text; RETURN;
  END IF;
  IF t ILIKE 'Circuit de la Sarthe%' OR t = 'Le Mans' THEN
    IF l ILIKE 'Mulsanne%' THEN RETURN QUERY SELECT 'Le Mans'::text, 'Mulsanne No Chicanes'::text; RETURN; END IF;
    RETURN QUERY SELECT 'Le Mans'::text, '24h Circuit'::text; RETURN;
  END IF;
  IF t ILIKE 'Autodromo Nazionale Monza%' OR t = 'Monza' THEN
    IF l ILIKE '%Grande%' THEN RETURN QUERY SELECT 'Monza'::text, 'Curva Grande'::text; RETURN; END IF;
    RETURN QUERY SELECT 'Monza'::text, 'Grand Prix'::text; RETURN;
  END IF;
  IF t ILIKE 'Circuit of the Americas%' OR t = 'Cota' THEN
    IF l ILIKE 'National%' THEN RETURN QUERY SELECT 'Cota'::text, 'National'::text; RETURN; END IF;
    RETURN QUERY SELECT 'Cota'::text, 'Circuit of the Americas'::text; RETURN;
  END IF;
  IF t ILIKE 'Lusail%' OR t = 'Lusail' THEN
    IF l ILIKE '%Short%' THEN RETURN QUERY SELECT 'Lusail'::text, 'Lusail Short'::text; RETURN; END IF;
    RETURN QUERY SELECT 'Lusail'::text, 'Lusail International Circuit'::text; RETURN;
  END IF;

  RETURN QUERY SELECT t, l;
END;
$$;

CREATE OR REPLACE FUNCTION public.upload_leaderboard_time_with_device_token(_token text, _driver_name text, _track text, _layout text, _car_class text, _car_model text, _best_lap_ms integer, _recorded_at timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  _token_row record;
  _profile record;
  _inserted_count integer := 0;
  _driver_norm text;
  _profile_norm text;
  _norm record;
begin
  if _token is null or _token !~* '^[a-f0-9]{64}$' then
    return jsonb_build_object('ok', false, 'error', 'Mangler eller ugyldigt device-token');
  end if;

  select id, user_id
    into _token_row
  from public.device_tokens
  where token_hash = encode(extensions.digest(_token, 'sha256'), 'hex')
  limit 1;

  if _token_row.id is null then
    return jsonb_build_object('ok', false, 'error', 'Ukendt device-token');
  end if;

  select lmu_name, approved
    into _profile
  from public.profiles
  where id = _token_row.user_id
  limit 1;

  if coalesce(_profile.approved, false) is not true then
    return jsonb_build_object('ok', false, 'error', 'Profilen er ikke godkendt endnu');
  end if;

  if nullif(trim(coalesce(_profile.lmu_name, '')), '') is null then
    return jsonb_build_object('ok', false, 'error', 'LMU-navn mangler på profilen');
  end if;

  _driver_norm := regexp_replace(lower(trim(coalesce(_driver_name, ''))), '\s+', ' ', 'g');
  _profile_norm := regexp_replace(lower(trim(coalesce(_profile.lmu_name, ''))), '\s+', ' ', 'g');
  if _driver_norm <> _profile_norm then
    return jsonb_build_object('ok', true, 'inserted', 0, 'duplicates', 0, 'skipped', 1, 'note', 'Du var ikke i filen — sprunget over');
  end if;

  if nullif(trim(coalesce(_driver_name, '')), '') is null
    or nullif(trim(coalesce(_track, '')), '') is null
    or nullif(trim(coalesce(_car_class, '')), '') is null
    or _best_lap_ms is null
    or _best_lap_ms <= 0
    or _best_lap_ms >= 3600000 then
    return jsonb_build_object('ok', false, 'error', 'Ugyldig omgangstid i filen');
  end if;

  select * into _norm from public.normalize_track_layout(_track, _layout);

  insert into public.leaderboard_times (
    user_id,
    driver_name,
    track,
    layout,
    car_class,
    car_model,
    best_lap_ms,
    source,
    uploaded_by,
    recorded_at
  )
  values (
    _token_row.user_id,
    trim(_driver_name),
    _norm.track,
    _norm.layout,
    trim(_car_class),
    nullif(trim(coalesce(_car_model, '')), ''),
    _best_lap_ms,
    'user',
    _token_row.user_id,
    _recorded_at
  )
  on conflict (user_id, track, layout, car_class, recorded_at) do nothing;

  get diagnostics _inserted_count = row_count;

  update public.device_tokens
  set last_used_at = now()
  where id = _token_row.id;

  return jsonb_build_object(
    'ok', true,
    'inserted', _inserted_count,
    'duplicates', case when _inserted_count = 0 then 1 else 0 end,
    'skipped', 0,
    'track', _norm.track,
    'layout', _norm.layout
  );
end;
$function$;
