CREATE OR REPLACE FUNCTION public.lmu_name_similarity(_a text, _b text)
RETURNS numeric LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public' AS $$
declare
  a text := regexp_replace(lower(trim(coalesce(_a,''))), '\s+', ' ', 'g');
  b text := regexp_replace(lower(trim(coalesce(_b,''))), '\s+', ' ', 'g');
  m int; n int; i int; j int; cost int;
  prev int[]; cur int[];
begin
  if a = '' or b = '' then return 0; end if;
  if a = b then return 1; end if;
  m := length(a); n := length(b);
  if m > 200 or n > 200 then return 0; end if;
  prev := array(select generate_series(0, n));
  for i in 1..m loop
    cur := array[i];
    for j in 1..n loop
      cost := case when substr(a,i,1) = substr(b,j,1) then 0 else 1 end;
      cur := cur || least(prev[j+1] + 1, cur[j] + 1, prev[j] + cost);
    end loop;
    prev := cur;
  end loop;
  return 1 - prev[n+1]::numeric / greatest(m, n);
end; $$;

CREATE OR REPLACE FUNCTION public.upload_leaderboard_time_with_device_token(_token text, _driver_name text, _track text, _layout text, _car_class text, _car_model text, _best_lap_ms integer, _recorded_at timestamp with time zone, _game_version text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $function$
declare
  _token_row record; _profile record; _inserted_count integer := 0; _norm record;
begin
  if _token is null or _token !~* '^[a-f0-9]{64}$' then
    return jsonb_build_object('ok', false, 'error', 'Mangler eller ugyldigt device-token');
  end if;
  select id, user_id into _token_row from public.device_tokens
  where token_hash = encode(extensions.digest(_token, 'sha256'), 'hex') limit 1;
  if _token_row.id is null then
    return jsonb_build_object('ok', false, 'error', 'Ukendt device-token');
  end if;
  select lmu_name, approved into _profile from public.profiles where id = _token_row.user_id limit 1;
  if coalesce(_profile.approved, false) is not true then
    return jsonb_build_object('ok', false, 'error', 'Profilen er ikke godkendt endnu');
  end if;
  if nullif(trim(coalesce(_profile.lmu_name, '')), '') is null then
    return jsonb_build_object('ok', false, 'error', 'LMU-navn mangler på profilen');
  end if;
  if public.lmu_name_similarity(_driver_name, _profile.lmu_name) < 0.85 then
    return jsonb_build_object('ok', true, 'inserted', 0, 'duplicates', 0, 'skipped', 1, 'note', 'Du var ikke i filen — sprunget over', 'file_name', _driver_name);
  end if;
  if nullif(trim(coalesce(_driver_name, '')), '') is null
    or nullif(trim(coalesce(_track, '')), '') is null
    or nullif(trim(coalesce(_car_class, '')), '') is null
    or _best_lap_ms is null or _best_lap_ms <= 0 or _best_lap_ms >= 3600000 then
    return jsonb_build_object('ok', false, 'error', 'Ugyldig omgangstid i filen');
  end if;
  select * into _norm from public.normalize_track_layout(_track, _layout);
  insert into public.leaderboard_times (user_id, driver_name, track, layout, car_class, car_model, best_lap_ms, source, uploaded_by, recorded_at, game_version)
  values (_token_row.user_id, trim(_driver_name), _norm.track, _norm.layout, trim(_car_class), nullif(trim(coalesce(_car_model, '')), ''), _best_lap_ms, 'user', _token_row.user_id, _recorded_at, nullif(trim(coalesce(_game_version, '')), ''))
  on conflict (user_id, track, layout, car_class, recorded_at) do nothing;
  get diagnostics _inserted_count = row_count;
  update public.device_tokens set last_used_at = now() where id = _token_row.id;
  return jsonb_build_object('ok', true, 'inserted', _inserted_count,
    'duplicates', case when _inserted_count = 0 then 1 else 0 end, 'skipped', 0,
    'track', _norm.track, 'layout', _norm.layout,
    'note', case when _inserted_count = 0 then 'Din tid var allerede uploadet' else null end);
end;
$function$;