begin;
select plan(7);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'a@test.dev'),
  ('00000000-0000-0000-0000-000000000002', 'b@test.dev');
insert into public.players (puuid, game_name, tag_line) values ('P1', 'Bad', 'GUY');

-- user A creates crew and flags P1
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated","user_metadata":{"full_name":"UserA"}}';
select lives_ok($$ select public.create_crew('Crew A') $$, 'A creates crew');
select lives_ok($$ insert into public.flags (crew_id, puuid, note) select id, 'P1', 'inted' from public.my_crew() $$, 'A flags P1');
select is((select created_by_name from public.flags limit 1), 'UserA', 'author name set by trigger');

-- user B, no crew, sees nothing
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated","user_metadata":{"full_name":"UserB"}}';
select is((select count(*) from public.flags), 0::bigint, 'B cannot see crew A flags');
select throws_ok($$ select public.join_crew('NOPE1234') $$, 'invalid invite code');

-- capture A's invite code as superuser, then join as B
reset role;
create temp table t as select invite_code from public.crews where name = 'Crew A';
grant select on t to authenticated;
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated","user_metadata":{"full_name":"UserB"}}';
select lives_ok(format($$ select public.join_crew(%L) $$, (select invite_code from t)), 'B joins with code');

-- B can now read but not delete A's flag (RLS filters the delete to 0 rows)
delete from public.flags;
select is((select count(*) from public.flags), 1::bigint, 'B cannot delete A''s flag');

select * from finish();
rollback;
