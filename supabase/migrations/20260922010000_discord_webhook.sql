-- Post a message to the crew's Discord channel when a flagged player shows up.
-- The webhook lives on the crew so a new friend needs no setup: they sign in,
-- join the crew, and their app already knows where to post.

alter table public.crews add column discord_webhook_url text;

-- Only the person who made the crew decides where its messages go.
create policy crews_update on public.crews for update to authenticated
  using (created_by = auth.uid()) with check (created_by = auth.uid());

-- One message per game per crew, no matter how many of us are in that game.
-- Whoever wins the insert is the one who posts.
create table public.alert_posts (
  crew_id uuid not null references public.crews(id) on delete cascade,
  game_id text not null,
  posted_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  posted_at timestamptz not null default now(),
  primary key (crew_id, game_id)
);
create index alert_posts_posted_at_idx on public.alert_posts(posted_at);

alter table public.alert_posts enable row level security;
create policy alert_posts_select on public.alert_posts for select to authenticated
  using (public.is_crew_member(crew_id));
create policy alert_posts_insert on public.alert_posts for insert to authenticated
  with check (public.is_crew_member(crew_id) and posted_by = auth.uid());
