-- Train Hard — Phase 1 schema (auth + cloud profile storage)
-- Run this in the Supabase SQL Editor (Project → SQL Editor → New Query).

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  display_name text,
  state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_username_idx on public.profiles (lower(username));

alter table public.profiles enable row level security;

create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Auto-create a profile row whenever a new auth user signs up.
-- Expects the client to pass `username` in auth.signUp's options.data.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', 'user_' || substr(new.id::text, 1, 8)),
    coalesce(new.raw_user_meta_data->>'username', 'Athlete')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- keep updated_at fresh on every write
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_profiles_updated on public.profiles;
create trigger on_profiles_updated
  before update on public.profiles
  for each row execute function public.set_updated_at();


-- ═══════════════════════════════════════════════════════════
-- Phase 3 — Friends
-- NOTE: run only this section if Phase 1 above has already been applied —
-- re-running the `create policy` statements above will error since a
-- policy of that name already exists.
-- ═══════════════════════════════════════════════════════════

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  addressee_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (requester_id <> addressee_id)
);

-- Generated columns so (A,B) and (B,A) can't both exist as separate rows —
-- prevents duplicate/crossed requests when two people friend each other at once.
alter table public.friendships add column if not exists low_id uuid generated always as (least(requester_id, addressee_id)) stored;
alter table public.friendships add column if not exists high_id uuid generated always as (greatest(requester_id, addressee_id)) stored;
create unique index if not exists friendships_pair_unique on public.friendships (low_id, high_id);

-- Denormalized so a pending request's two sides can display each other's
-- username without needing a profiles-read policy that reaches beyond
-- accepted friends (see the profiles SELECT policy below).
alter table public.friendships add column if not exists requester_username text;
alter table public.friendships add column if not exists addressee_username text;

create or replace function public.set_friendship_usernames()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  select username into new.requester_username from public.profiles where id = new.requester_id;
  select username into new.addressee_username from public.profiles where id = new.addressee_id;
  return new;
end;
$$;

drop trigger if exists on_friendship_insert on public.friendships;
create trigger on_friendship_insert
  before insert on public.friendships
  for each row execute function public.set_friendship_usernames();

create index if not exists friendships_requester_idx on public.friendships (requester_id);
create index if not exists friendships_addressee_idx on public.friendships (addressee_id);

alter table public.friendships enable row level security;

create policy "Users can view their own friendships"
  on public.friendships for select
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

create policy "Users can send friend requests"
  on public.friendships for insert
  with check (auth.uid() = requester_id);

create policy "Addressee can accept a request"
  on public.friendships for update
  using (auth.uid() = addressee_id)
  with check (auth.uid() = addressee_id);

create policy "Either side can remove a friendship"
  on public.friendships for delete
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

drop trigger if exists on_friendships_updated on public.friendships;
create trigger on_friendships_updated
  before update on public.friendships
  for each row execute function public.set_updated_at();

-- Let accepted friends read each other's full profile (including `state`,
-- which is how the friend's-muscle-levels view gets its data — the client
-- reuses the same level-calculation logic against the friend's state blob).
create policy "Friends can view each other's profile"
  on public.profiles for select
  using (
    exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
        and ((f.requester_id = auth.uid() and f.addressee_id = profiles.id)
          or (f.addressee_id = auth.uid() and f.requester_id = profiles.id))
    )
  );

-- Exact-match username lookup for "add a friend" — a SECURITY DEFINER
-- function so it can find a user by username without needing a broad
-- "anyone can read anyone's profile" policy (it only ever returns
-- id/username/display_name, never `state`).
create or replace function public.find_profile_by_username(search text)
returns table(id uuid, username text, display_name text)
language sql
security definer
set search_path = public
as $$
  select id, username, display_name
  from public.profiles
  where lower(username) = lower(search)
  limit 1;
$$;

grant execute on function public.find_profile_by_username(text) to authenticated;

-- Let the client subscribe to live changes on friendships (request sent,
-- accepted, removed) so the UI updates without a manual refresh.
-- Realtime still enforces the RLS policies above, so each user only
-- receives events for rows they're already allowed to see.
alter publication supabase_realtime add table public.friendships;


-- ═══════════════════════════════════════════════════════════
-- Phase 4 — Challenges
-- Progress is computed client-side from each participant's existing
-- `profiles.state` history (already readable between accepted friends via
-- the policy above) — there's no separate weekly-snapshot table. This
-- section only stores who's in a challenge, what exercise each of them
-- picked, and the chat log.
-- ═══════════════════════════════════════════════════════════

create table if not exists public.challenges (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  duration_weeks int not null check (duration_weeks between 1 and 52),
  start_date date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.challenge_participants (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  username text,
  exercise_name text,
  status text not null default 'invited' check (status in ('invited', 'joined', 'declined')),
  joined_at timestamptz,
  unique (challenge_id, user_id)
);

create table if not exists public.challenge_messages (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  username text,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists challenge_participants_challenge_idx on public.challenge_participants (challenge_id);
create index if not exists challenge_participants_user_idx on public.challenge_participants (user_id);
create index if not exists challenge_messages_challenge_idx on public.challenge_messages (challenge_id);

-- Auto-join the creator as a participant (status 'joined') the moment a
-- challenge is created, so the client only ever inserts participant rows
-- for the friend(s) being invited, never for itself.
create or replace function public.add_creator_as_participant()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.challenge_participants (challenge_id, user_id, username, status, joined_at)
  select new.id, new.creator_id, p.username, 'joined', now()
  from public.profiles p where p.id = new.creator_id;
  return new;
end;
$$;

drop trigger if exists on_challenge_created on public.challenges;
create trigger on_challenge_created
  after insert on public.challenges
  for each row execute function public.add_creator_as_participant();

-- Stamp the invited user's username (same denormalization reasoning as
-- friendships) and reject invites to anyone who isn't an accepted friend
-- of the challenge's creator.
create or replace function public.check_and_stamp_participant()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  creator uuid;
begin
  select creator_id into creator from public.challenges where id = new.challenge_id;
  if new.user_id <> creator then
    if not exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
        and ((f.requester_id = creator and f.addressee_id = new.user_id)
          or (f.addressee_id = creator and f.requester_id = new.user_id))
    ) then
      raise exception 'Can only invite accepted friends to a challenge';
    end if;
  end if;
  select username into new.username from public.profiles where id = new.user_id;
  return new;
end;
$$;

drop trigger if exists on_participant_insert on public.challenge_participants;
create trigger on_participant_insert
  before insert on public.challenge_participants
  for each row execute function public.check_and_stamp_participant();

create or replace function public.stamp_message_username()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  select username into new.username from public.profiles where id = new.user_id;
  return new;
end;
$$;

drop trigger if exists on_message_insert on public.challenge_messages;
create trigger on_message_insert
  before insert on public.challenge_messages
  for each row execute function public.stamp_message_username();

alter table public.challenges enable row level security;
alter table public.challenge_participants enable row level security;
alter table public.challenge_messages enable row level security;

create policy "Participants can view their challenges"
  on public.challenges for select
  using (exists (select 1 from public.challenge_participants cp where cp.challenge_id = challenges.id and cp.user_id = auth.uid()));

create policy "Users can create challenges"
  on public.challenges for insert
  with check (creator_id = auth.uid());

create policy "Creator can update or cancel their challenge"
  on public.challenges for update
  using (creator_id = auth.uid());

create policy "Creator can delete their challenge"
  on public.challenges for delete
  using (creator_id = auth.uid());

-- A policy on challenge_participants that queries challenge_participants
-- itself triggers Postgres's "infinite recursion detected in policy" check
-- (evaluating the policy for the subquery's candidate rows re-triggers the
-- same policy, forever). Routing the self-check through a SECURITY DEFINER
-- function breaks the cycle since the function's internal query bypasses RLS.
create or replace function public.is_challenge_participant(cid uuid, uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.challenge_participants cp
    where cp.challenge_id = cid and cp.user_id = uid
  );
$$;

grant execute on function public.is_challenge_participant(uuid, uuid) to authenticated;

create policy "Participants can view co-participants"
  on public.challenge_participants for select
  using (public.is_challenge_participant(challenge_id, auth.uid()));

create policy "Creator can invite friends to their challenge"
  on public.challenge_participants for insert
  with check (exists (select 1 from public.challenges c where c.id = challenge_id and c.creator_id = auth.uid()));

create policy "Participant can update their own row"
  on public.challenge_participants for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Participant can leave, creator can remove"
  on public.challenge_participants for delete
  using (user_id = auth.uid() or exists (select 1 from public.challenges c where c.id = challenge_id and c.creator_id = auth.uid()));

create policy "Participants can read challenge chat"
  on public.challenge_messages for select
  using (exists (select 1 from public.challenge_participants cp where cp.challenge_id = challenge_messages.challenge_id and cp.user_id = auth.uid()));

create policy "Participants can post to challenge chat"
  on public.challenge_messages for insert
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.challenge_participants cp where cp.challenge_id = challenge_messages.challenge_id and cp.user_id = auth.uid())
  );

drop trigger if exists on_challenges_updated on public.challenges;
create trigger on_challenges_updated
  before update on public.challenges
  for each row execute function public.set_updated_at();

alter publication supabase_realtime add table public.challenges;
alter publication supabase_realtime add table public.challenge_participants;
alter publication supabase_realtime add table public.challenge_messages;


-- ═══════════════════════════════════════════════════════════
-- Phase 4c — Fix: "infinite recursion detected in policy for relation
-- challenge_participants". The original "Participants can view
-- co-participants" policy queried challenge_participants from within its
-- own policy, which Postgres rejects. Run this if you already applied
-- Phase 4 above and hit that error — it replaces just the broken policy.
-- ═══════════════════════════════════════════════════════════

create or replace function public.is_challenge_participant(cid uuid, uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.challenge_participants cp
    where cp.challenge_id = cid and cp.user_id = uid
  );
$$;

grant execute on function public.is_challenge_participant(uuid, uuid) to authenticated;

drop policy if exists "Participants can view co-participants" on public.challenge_participants;
create policy "Participants can view co-participants"
  on public.challenge_participants for select
  using (public.is_challenge_participant(challenge_id, auth.uid()));


-- ═══════════════════════════════════════════════════════════
-- Phase 4d — Fix: "new row violates row-level security policy for table
-- challenges". The insert policies check creator_id/user_id = auth.uid(),
-- but the client was supplying that id itself — if it were ever stale
-- (e.g. a cached session value out of sync with the actual authenticated
-- request), the check would fail. Defaulting the column to auth.uid() at
-- the database level makes it structurally impossible for the two to
-- mismatch, since the client no longer supplies the value at all.
-- ═══════════════════════════════════════════════════════════

alter table public.challenges alter column creator_id set default auth.uid();
alter table public.challenge_messages alter column user_id set default auth.uid();


-- ═══════════════════════════════════════════════════════════
-- Phase 4e — Temporary debug helper. Lets the client ask Postgres directly
-- "who do you think I am and what role am I?" for the current request, to
-- diagnose the "new row violates row-level security policy" error when the
-- policy and defaults both look correct. Safe to leave in; drop later with
-- `drop function public.debug_whoami();` once the RLS issue is resolved.
-- ═══════════════════════════════════════════════════════════

create or replace function public.debug_whoami()
returns table(uid uuid, role text)
language sql
stable
as $$
  select auth.uid(), auth.role();
$$;

grant execute on function public.debug_whoami() to authenticated, anon;


-- ═══════════════════════════════════════════════════════════
-- Phase 4b — Challenge description field
-- ═══════════════════════════════════════════════════════════
alter table public.challenges add column if not exists description text;


-- ═══════════════════════════════════════════════════════════
-- Phase 4f — Fix: "Participants can view their challenges" compared
-- cp.challenge_id to cp.id (both from the challenge_participants alias)
-- instead of to challenges.id, because the unqualified `id` in the
-- subquery bound to the nearer table (challenge_participants also has an
-- `id` column) instead of the outer `challenges` table. Always qualify
-- column names in correlated subqueries when both tables share a name.
-- This silently broke reading challenges — including via the RETURNING
-- clause on insert, which is why *creating* a challenge failed with the
-- same "row-level security" error even though the INSERT check was fine.
-- ═══════════════════════════════════════════════════════════

drop policy if exists "Participants can view their challenges" on public.challenges;
create policy "Participants can view their challenges"
  on public.challenges for select
  using (exists (select 1 from public.challenge_participants cp where cp.challenge_id = challenges.id and cp.user_id = auth.uid()));


-- ═══════════════════════════════════════════════════════════
-- Phase 4g — Fix: even with the qualification bug above fixed, INSERT ...
-- RETURNING on challenges still failed with the same RLS error, because
-- the SELECT policy only recognized creator/participant via the
-- challenge_participants row — which is created by the on_challenge_created
-- AFTER INSERT trigger and doesn't exist yet at the moment Postgres checks
-- SELECT-policy visibility for the RETURNING clause. Letting the creator
-- see their own challenges directly (no join needed) removes that
-- chicken-and-egg dependency entirely.
-- ═══════════════════════════════════════════════════════════

drop policy if exists "Participants can view their challenges" on public.challenges;
create policy "Participants can view their challenges"
  on public.challenges for select
  using (
    creator_id = auth.uid()
    or exists (select 1 from public.challenge_participants cp where cp.challenge_id = challenges.id and cp.user_id = auth.uid())
  );


-- ═══════════════════════════════════════════════════════════
-- Phase 5 — Profile pictures
-- Public storage bucket (avatars aren't sensitive) with per-user folders
-- (path convention: "{auth.uid()}/avatar.jpg") so RLS can restrict writes
-- to your own folder while reads stay public (served straight off
-- Supabase's storage CDN via the public URL, not through RLS at all).
-- ═══════════════════════════════════════════════════════════

alter table public.profiles add column if not exists avatar_url text;

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "Avatar images are publicly accessible" on storage.objects;
create policy "Avatar images are publicly accessible"
  on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "Users can upload their own avatar" on storage.objects;
create policy "Users can upload their own avatar"
  on storage.objects for insert
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users can update their own avatar" on storage.objects;
create policy "Users can update their own avatar"
  on storage.objects for update
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users can delete their own avatar" on storage.objects;
create policy "Users can delete their own avatar"
  on storage.objects for delete
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);


-- ═══════════════════════════════════════════════════════════
-- Phase 6 — Rename anytime + per-friend nicknames
-- Usernames are already unique+editable at the DB level (the "Users can
-- update own profile" policy from Phase 1 already allows changing
-- `username`); this section adds: (a) a trigger to keep the *denormalized*
-- copies of a username (on friendships and challenge_participants/messages
-- rows) in sync whenever it changes, since those were only ever stamped
-- once at insert time, and (b) a private per-user nickname-for-a-friend
-- table, independent in both directions (my nickname for you has nothing
-- to do with your nickname for me).
-- ═══════════════════════════════════════════════════════════

create or replace function public.sync_username_on_change()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.username is distinct from old.username then
    update public.friendships set requester_username = new.username where requester_id = new.id;
    update public.friendships set addressee_username = new.username where addressee_id = new.id;
    update public.challenge_participants set username = new.username where user_id = new.id;
    update public.challenge_messages set username = new.username where user_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_profile_username_updated on public.profiles;
create trigger on_profile_username_updated
  after update on public.profiles
  for each row execute function public.sync_username_on_change();

create table if not exists public.friend_nicknames (
  user_id uuid not null references auth.users(id) on delete cascade,
  friend_id uuid not null references auth.users(id) on delete cascade,
  nickname text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, friend_id)
);

alter table public.friend_nicknames enable row level security;

drop policy if exists "Users manage their own nicknames" on public.friend_nicknames;
create policy "Users manage their own nicknames"
  on public.friend_nicknames for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ═══════════════════════════════════════════════════════════
-- Case-insensitive + no-space usernames (2026-07-23)
-- The original `username text unique not null` constraint is
-- case-SENSITIVE, so "test1" and "TEST1" could both be registered as
-- separate accounts — confusing "add a friend" (which account did that
-- request come from?) and letting near-duplicate usernames slip through.
-- Client-side already normalizes (strips spaces, checks
-- find_profile_by_username before submit), but the database is the real
-- backstop against two people racing to grab the same name in different
-- casings. This replaces the case-sensitive unique constraint with a
-- unique index on the *lowercased* value, and adds a check constraint
-- forbidding whitespace outright.
--
-- NOTE: if two accounts already exist that differ only by case (e.g.
-- "test1" and "TEST1"), creating the unique index below will fail with a
-- duplicate-key error — rename one of them manually first, then re-run.
-- ═══════════════════════════════════════════════════════════

alter table public.profiles drop constraint if exists profiles_username_key;
drop index if exists profiles_username_idx;

create unique index if not exists profiles_username_lower_unique on public.profiles (lower(username));

alter table public.profiles drop constraint if exists profiles_username_no_spaces;
alter table public.profiles add constraint profiles_username_no_spaces check (username !~ '\s');

-- Defense-in-depth: strip whitespace from the username the signup trigger
-- seeds a new profile with too, in case a client ever sends one un-sanitized.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    regexp_replace(coalesce(new.raw_user_meta_data->>'username', 'user_' || substr(new.id::text, 1, 8)), '\s+', '', 'g'),
    coalesce(new.raw_user_meta_data->>'username', 'Athlete')
  );
  return new;
end;
$$;

-- ═══════════════════════════════════════════════════════════
-- Fix: friend usernames going stale after a rename (2026-07-23)
-- The sync_username_on_change trigger (Phase 6, above) only corrects
-- denormalized usernames on friendships/challenge_participants/
-- challenge_messages going FORWARD from whenever it runs — any rows that
-- were denormalized before that trigger existed (or before someone's most
-- recent rename) are left stuck with the old value forever, since nothing
-- else ever re-reads them. This is a one-time backfill to bring every
-- already-stale row in line with the current profiles.username right now.
-- Safe to re-run any time.
-- ═══════════════════════════════════════════════════════════

update public.friendships f
set requester_username = p.username
from public.profiles p
where p.id = f.requester_id and f.requester_username is distinct from p.username;

update public.friendships f
set addressee_username = p.username
from public.profiles p
where p.id = f.addressee_id and f.addressee_username is distinct from p.username;

update public.challenge_participants cp
set username = p.username
from public.profiles p
where p.id = cp.user_id and cp.username is distinct from p.username;

update public.challenge_messages cm
set username = p.username
from public.profiles p
where p.id = cm.user_id and cm.username is distinct from p.username;


-- ═══════════════════════════════════════════════════════════
-- Phase 7 — Automatic state backups (2026-08-03)
-- A client-side sync bug (fixed the same day) could make a bad `state`
-- write overwrite good history — the reinstall flow briefly treated a
-- freshly-empty local profile as "newer" than real cloud data and pushed
-- the empty state up, permanently wiping the free-plan project (no PITR,
-- no scheduled backups on that tier). This snapshots the PREVIOUS value of
-- profiles.state on every change, before the overwrite lands, so any
-- future bug of this shape is recoverable from here instead of being
-- unrecoverable. Trimmed to the last 20 snapshots per user so the table
-- can't grow unbounded.
-- ═══════════════════════════════════════════════════════════

create table if not exists public.profile_state_backups (
  id bigint generated always as identity primary key,
  profile_id uuid not null references auth.users(id) on delete cascade,
  state jsonb not null,
  history_count int,
  saved_at timestamptz not null default now()
);

create index if not exists profile_state_backups_profile_idx
  on public.profile_state_backups (profile_id, saved_at desc);

alter table public.profile_state_backups enable row level security;

drop policy if exists "Users can view their own backups" on public.profile_state_backups;
create policy "Users can view their own backups"
  on public.profile_state_backups for select
  using (auth.uid() = profile_id);

create or replace function public.backup_profile_state()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if old.state is distinct from new.state then
    insert into public.profile_state_backups (profile_id, state, history_count)
    values (
      old.id,
      old.state,
      case when jsonb_typeof(old.state->'history') = 'array'
        then jsonb_array_length(old.state->'history') else 0 end
    );

    delete from public.profile_state_backups
    where profile_id = old.id
      and id not in (
        select id from public.profile_state_backups
        where profile_id = old.id
        order by saved_at desc
        limit 20
      );
  end if;
  return new;
end;
$$;

drop trigger if exists on_profile_state_backup on public.profiles;
create trigger on_profile_state_backup
  before update on public.profiles
  for each row execute function public.backup_profile_state();

-- Phase 8: let a second signed-in device (e.g. a "live view" left open on
-- another phone) pick up a freshly-logged workout without a reload. The
-- client subscribes to postgres_changes on its own profiles row; without
-- this the table was never added to the realtime publication, so those
-- UPDATE events silently never arrived.
alter publication supabase_realtime add table public.profiles;
