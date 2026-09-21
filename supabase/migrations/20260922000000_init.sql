create extension if not exists pgcrypto with schema extensions;

create table public.crews (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 40),
  invite_code text not null unique default upper(substr(encode(extensions.gen_random_bytes(6), 'hex'), 1, 8)),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.crew_members (
  crew_id uuid not null references public.crews(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  discord_name text not null default 'unknown',
  joined_at timestamptz not null default now(),
  primary key (crew_id, user_id)
);
-- MVP: one crew per user
create unique index crew_members_one_per_user on public.crew_members(user_id);

create table public.players (
  puuid text primary key,
  game_name text not null,
  tag_line text not null,
  region text,
  last_seen_at timestamptz not null default now()
);

create table public.flags (
  id uuid primary key default gen_random_uuid(),
  crew_id uuid not null references public.crews(id) on delete cascade,
  puuid text not null references public.players(puuid) on delete cascade,
  note text not null check (length(note) between 1 and 500),
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_by_name text not null default '',
  created_at timestamptz not null default now()
);
create index flags_crew_idx on public.flags(crew_id);
create index flags_puuid_idx on public.flags(puuid);

alter table public.crews enable row level security;
alter table public.crew_members enable row level security;
alter table public.players enable row level security;
alter table public.flags enable row level security;

create or replace function public.is_crew_member(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.crew_members where crew_id = c and user_id = auth.uid())
$$;

create or replace function public.current_discord_name() returns text
language sql stable as $$
  select coalesce(
    auth.jwt() -> 'user_metadata' -> 'custom_claims' ->> 'global_name',
    auth.jwt() -> 'user_metadata' ->> 'full_name',
    auth.jwt() -> 'user_metadata' ->> 'name',
    'unknown')
$$;

-- crews: members can read; nobody inserts directly (use create_crew)
create policy crews_select on public.crews for select to authenticated using (public.is_crew_member(id));

-- crew_members: members can see their crew's roster
create policy crew_members_select on public.crew_members for select to authenticated using (public.is_crew_member(crew_id));

-- players: any signed-in user can read/upsert (names are public game data)
create policy players_select on public.players for select to authenticated using (true);
create policy players_insert on public.players for insert to authenticated with check (true);
create policy players_update on public.players for update to authenticated using (true) with check (true);

-- flags: crew-scoped; only author edits/deletes
create policy flags_select on public.flags for select to authenticated using (public.is_crew_member(crew_id));
create policy flags_insert on public.flags for insert to authenticated with check (public.is_crew_member(crew_id) and created_by = auth.uid());
create policy flags_update on public.flags for update to authenticated using (created_by = auth.uid()) with check (created_by = auth.uid());
create policy flags_delete on public.flags for delete to authenticated using (created_by = auth.uid());

create or replace function public.set_flag_author() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.created_by := auth.uid();
  select discord_name into new.created_by_name from public.crew_members
    where crew_id = new.crew_id and user_id = auth.uid();
  new.created_by_name := coalesce(new.created_by_name, 'unknown');
  return new;
end $$;
create trigger flags_set_author before insert on public.flags for each row execute function public.set_flag_author();

create or replace function public.create_crew(p_name text) returns public.crews
language plpgsql security definer set search_path = public as $$
declare c public.crews;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into public.crews (name, created_by) values (p_name, auth.uid()) returning * into c;
  insert into public.crew_members (crew_id, user_id, discord_name) values (c.id, auth.uid(), public.current_discord_name());
  return c;
end $$;

create or replace function public.join_crew(p_code text) returns public.crews
language plpgsql security definer set search_path = public as $$
declare c public.crews;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into c from public.crews where invite_code = upper(trim(p_code));
  if c.id is null then raise exception 'invalid invite code'; end if;
  insert into public.crew_members (crew_id, user_id, discord_name) values (c.id, auth.uid(), public.current_discord_name())
    on conflict do nothing;
  return c;
end $$;

create or replace function public.my_crew() returns public.crews
language sql stable security definer set search_path = public as $$
  select c.* from public.crews c join public.crew_members m on m.crew_id = c.id where m.user_id = auth.uid() limit 1
$$;

alter publication supabase_realtime add table public.flags;
