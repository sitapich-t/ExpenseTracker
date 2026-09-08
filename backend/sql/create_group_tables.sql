-- ============================================
-- Student Wallet — Group Feature Tables
-- Run in Supabase → SQL Editor → New query
--
-- NOTE: This app uses CUSTOM auth (its own `users` table + own JWT),
-- NOT Supabase Auth. `auth.uid()` will NEVER match the app's
-- `user_id` values (they are `users.id` uuids created by the backend),
-- so we do NOT key RLS on auth.uid(). Access is controlled at the
-- API layer: every query in groupController.js filters by
-- created_by / group_id / user_id.
-- ============================================

-- ============================================
-- 1) GROUPS
-- ============================================
create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null default 'General',
  created_by uuid not null references public.users (id) on delete cascade,
  members_count integer not null default 1,
  total_spend numeric(12, 2) not null default 0,
  status_type text not null default 'settled',   -- settled | pending | split
  amount numeric(12, 2) not null default 0,
  icon text not null default 'home-outline',
  icon_bg text not null default '#ede9fe',
  icon_color text not null default '#6d28d9',
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_groups_created_by on public.groups (created_by);
create index if not exists idx_groups_created_at on public.groups (created_at desc);

-- ============================================
-- 2) GROUP_TRANSACTIONS
-- ============================================
create table if not exists public.group_transactions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  created_by uuid not null references public.users (id) on delete cascade,
  title text not null,
  type text not null default 'expense',         -- income | expense
  amount numeric(12, 2) not null,
  merchant text not null default 'General',
  category text not null default 'General',
  transaction_date timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_group_tx_group on public.group_transactions (group_id);
create index if not exists idx_group_tx_created_at on public.group_transactions (group_id, created_at desc);

-- ============================================
-- 3) GROUP_MEMBERS
-- ============================================
create table if not exists public.group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  joined_at timestamptz not null default timezone('utc', now()),
  unique (group_id, user_id)
);

create index if not exists idx_group_members_group on public.group_members (group_id);
create index if not exists idx_group_members_user on public.group_members (user_id);

-- ============================================
-- RLS (OPTIONAL)
-- Graduate with the rest of your tables. If your existing
-- `users` / `personal_*` tables have RLS disabled (or your
-- SUPABASE_KEY is a service_role key), skip this block.
--
-- NOTE: because Supabase can't read the app's custom JWT, RLS here
-- can only be "allow anon", which is no more secure than no RLS —
-- real scoping happens in the Node API. Enable only for parity.
-- ============================================
-- alter table public.groups enable row level security;
-- alter table public.group_transactions enable row level security;
-- alter table public.group_members enable row level security;

-- drop policy if exists "group_all_anon" on public.groups;
-- create policy "group_all_anon" on public.groups
--   for all using (true) with check (true);

-- drop policy if exists "group_tx_all_anon" on public.group_transactions;
-- create policy "group_tx_all_anon" on public.group_transactions
--   for all using (true) with check (true);

-- drop policy if exists "group_members_all_anon" on public.group_members;
-- create policy "group_members_all_anon" on public.group_members
--   for all using (true) with check (true);