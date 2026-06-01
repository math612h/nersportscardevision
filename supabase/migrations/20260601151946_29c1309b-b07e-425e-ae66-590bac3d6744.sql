
-- Roles enum
create type public.app_role as enum ('admin', 'racer');

-- Profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "Profiles readable by authenticated" on public.profiles for select to authenticated using (true);
create policy "Users can insert own profile" on public.profiles for insert to authenticated with check (auth.uid() = id);
create policy "Users can update own profile" on public.profiles for update to authenticated using (auth.uid() = id);

-- user_roles
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;
create policy "Users can read own roles" on public.user_roles for select to authenticated using (auth.uid() = user_id);

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

-- Admin read-all roles policy
create policy "Admins can read all roles" on public.user_roles for select to authenticated using (public.has_role(auth.uid(), 'admin'));

-- Auto-create profile + default racer role on signup; first user becomes admin
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  user_count int;
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));

  select count(*) into user_count from auth.users;
  if user_count <= 1 then
    insert into public.user_roles (user_id, role) values (new.id, 'admin');
  else
    insert into public.user_roles (user_id, role) values (new.id, 'racer');
  end if;
  return new;
end; $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Leagues
create table public.leagues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  banner_url text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
grant select on public.leagues to authenticated;
grant insert, update, delete on public.leagues to authenticated;
grant all on public.leagues to service_role;
alter table public.leagues enable row level security;
create policy "Leagues readable by authenticated" on public.leagues for select to authenticated using (true);
create policy "Admins manage leagues insert" on public.leagues for insert to authenticated with check (public.has_role(auth.uid(), 'admin'));
create policy "Admins manage leagues update" on public.leagues for update to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "Admins manage leagues delete" on public.leagues for delete to authenticated using (public.has_role(auth.uid(), 'admin'));

-- Divisions (afdelinger)
create table public.divisions (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  name text not null,
  car_class text,
  driver_category text,
  track text,
  layout text,
  race_date timestamptz,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.divisions to authenticated;
grant all on public.divisions to service_role;
alter table public.divisions enable row level security;
create policy "Divisions readable by authenticated" on public.divisions for select to authenticated using (true);
create policy "Admins insert divisions" on public.divisions for insert to authenticated with check (public.has_role(auth.uid(), 'admin'));
create policy "Admins update divisions" on public.divisions for update to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "Admins delete divisions" on public.divisions for delete to authenticated using (public.has_role(auth.uid(), 'admin'));

-- Entries
create table public.entries (
  id uuid primary key default gen_random_uuid(),
  division_id uuid not null references public.divisions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  driver_name text not null,
  car_class text not null,
  driver_category text not null,
  created_at timestamptz not null default now(),
  unique (division_id, user_id)
);
grant select, insert, update, delete on public.entries to authenticated;
grant all on public.entries to service_role;
alter table public.entries enable row level security;
create policy "Entries readable by authenticated" on public.entries for select to authenticated using (true);
create policy "Users insert own entries" on public.entries for insert to authenticated with check (auth.uid() = user_id);
create policy "Users update own entries" on public.entries for update to authenticated using (auth.uid() = user_id or public.has_role(auth.uid(), 'admin'));
create policy "Users or admin delete entries" on public.entries for delete to authenticated using (auth.uid() = user_id or public.has_role(auth.uid(), 'admin'));

-- Rulesets
create table public.rulesets (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  title text not null,
  content text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.rulesets to authenticated;
grant all on public.rulesets to service_role;
alter table public.rulesets enable row level security;
create policy "Rulesets readable by authenticated" on public.rulesets for select to authenticated using (true);
create policy "Admins insert rulesets" on public.rulesets for insert to authenticated with check (public.has_role(auth.uid(), 'admin'));
create policy "Admins update rulesets" on public.rulesets for update to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "Admins delete rulesets" on public.rulesets for delete to authenticated using (public.has_role(auth.uid(), 'admin'));

-- Protests
create table public.protests (
  id uuid primary key default gen_random_uuid(),
  division_id uuid not null references public.divisions(id) on delete cascade,
  submitted_by uuid not null references auth.users(id) on delete cascade,
  lap_number int,
  corner text,
  involved_drivers text,
  description text not null,
  video_url text,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.protests to authenticated;
grant all on public.protests to service_role;
alter table public.protests enable row level security;
create policy "Users see own protests or admin sees all" on public.protests for select to authenticated using (auth.uid() = submitted_by or public.has_role(auth.uid(), 'admin'));
create policy "Users insert own protests" on public.protests for insert to authenticated with check (auth.uid() = submitted_by);
create policy "Users or admin delete protests" on public.protests for delete to authenticated using (auth.uid() = submitted_by or public.has_role(auth.uid(), 'admin'));
