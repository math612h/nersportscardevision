create or replace function public.upload_leaderboard_time_with_device_token(
  _token text,
  _driver_name text,
  _track text,
  _layout text,
  _car_class text,
  _car_model text,
  _best_lap_ms integer,
  _recorded_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  _token_row record;
  _profile record;
  _inserted_count integer := 0;
  _driver_norm text;
  _profile_norm text;
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
    trim(_track),
    nullif(trim(coalesce(_layout, '')), ''),
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
    'track', trim(_track),
    'layout', nullif(trim(coalesce(_layout, '')), '')
  );
end;
$$;