create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null default 'Treinador',
  email text,
  avatar_url text,
  score int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.caught_pokemon (
  user_id uuid not null references auth.users(id) on delete cascade,
  pokemon_id int not null,
  pokemon_name text not null,
  sprite_url text,
  types jsonb not null default '[]'::jsonb,
  caught_at timestamptz not null default now(),
  primary key (user_id, pokemon_id)
);

create table if not exists public.teams (
  user_id uuid primary key references auth.users(id) on delete cascade,
  pokemon_ids int[] not null default '{}',
  updated_at timestamptz not null default now(),
  constraint max_team_size check (array_length(pokemon_ids, 1) is null or array_length(pokemon_ids, 1) <= 6)
);

alter table public.profiles enable row level security;
alter table public.caught_pokemon enable row level security;
alter table public.teams enable row level security;

drop policy if exists "profiles readable by logged users" on public.profiles;
drop policy if exists "users create own profile" on public.profiles;
drop policy if exists "users update own profile" on public.profiles;
drop policy if exists "users read own caught pokemon" on public.caught_pokemon;
drop policy if exists "users insert own caught pokemon" on public.caught_pokemon;
drop policy if exists "users read own team" on public.teams;
drop policy if exists "users upsert own team" on public.teams;
drop policy if exists "users update own team" on public.teams;

create policy "profiles readable by logged users"
on public.profiles for select
to authenticated
using (true);

create policy "users create own profile"
on public.profiles for insert
to authenticated
with check ((select auth.uid()) = id);

create policy "users update own profile"
on public.profiles for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create policy "users read own caught pokemon"
on public.caught_pokemon for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "users insert own caught pokemon"
on public.caught_pokemon for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "users read own team"
on public.teams for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "users upsert own team"
on public.teams for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "users update own team"
on public.teams for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create or replace function public.refresh_profile_score()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user uuid;
begin
  target_user := coalesce(new.user_id, old.user_id);

  update public.profiles
  set score = (
    select count(*)::int
    from public.caught_pokemon
    where user_id = target_user
  ),
  updated_at = now()
  where id = target_user;

  return null;
end;
$$;

drop trigger if exists caught_pokemon_score_refresh on public.caught_pokemon;
create trigger caught_pokemon_score_refresh
after insert or delete on public.caught_pokemon
for each row execute function public.refresh_profile_score();

revoke insert(score), update(score) on public.profiles from authenticated;
grant insert(id, username, email, avatar_url, created_at, updated_at) on public.profiles to authenticated;
grant update(username, email, avatar_url, updated_at) on public.profiles to authenticated;

update public.profiles profile
set score = coalesce(counts.total, 0),
updated_at = now()
from (
  select profiles.id, count(caught_pokemon.pokemon_id)::int as total
  from public.profiles
  left join public.caught_pokemon on caught_pokemon.user_id = profiles.id
  group by profiles.id
) counts
where profile.id = counts.id
  and profile.score is distinct from counts.total;
