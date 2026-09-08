-- Run this in the Supabase SQL editor (Project -> SQL Editor -> New query).
-- Requires Supabase Auth to already be enabled (it is, by default) --
-- every row here is scoped to auth.uid(), so users only ever see their own data.

create extension if not exists "pgcrypto"; -- for gen_random_uuid()

create table if not exists public.watchlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  exchange text not null check (exchange in ('NSE', 'BSE')),
  created_at timestamptz not null default now()
);

create table if not exists public.watchlist_items (
  id uuid primary key default gen_random_uuid(),
  watchlist_id uuid not null references public.watchlists(id) on delete cascade,
  symbol text not null,       -- e.g. 'RELIANCE' or '500325'
  name text,
  yf_symbol text not null,    -- e.g. 'RELIANCE.NS' or '500325.BO'
  added_at timestamptz not null default now(),
  unique (watchlist_id, symbol)
);

create index if not exists watchlists_user_id_idx on public.watchlists (user_id);
create index if not exists watchlist_items_watchlist_id_idx on public.watchlist_items (watchlist_id);

alter table public.watchlists enable row level security;
alter table public.watchlist_items enable row level security;

-- A user can only see/insert/update/delete their own watchlists.
create policy "watchlists_owner_all" on public.watchlists
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Items are gated through their parent watchlist's ownership.
create policy "watchlist_items_owner_all" on public.watchlist_items
  for all
  using (exists (
    select 1 from public.watchlists w
    where w.id = watchlist_items.watchlist_id and w.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.watchlists w
    where w.id = watchlist_items.watchlist_id and w.user_id = auth.uid()
  ));
