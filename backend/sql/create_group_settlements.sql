-- ============================================
-- Group Settlements (ผลการตัดหนี้หลัง simplifyDebts)
-- เก็บรายการ "จาก -> ไป -> ยอดเงิน" หลังอัลกอริทึม Greedy
-- ============================================
create table if not exists public.group_settlements (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  from_user_id uuid not null references public.users(id) on delete cascade,
  to_user_id uuid not null references public.users(id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  status text not null default 'pending',  -- pending | paid | cancelled
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  paid_at timestamptz,
  paid_by uuid references public.users(id) on delete set null, -- คนที่กด "จ่ายแล้ว"
  note text
);

create index if not exists idx_group_settlements_group_id on public.group_settlements(group_id);
create index if not exists idx_group_settlements_from on public.group_settlements(from_user_id);
create index if not exists idx_group_settlements_to on public.group_settlements(to_user_id);
create index if not exists idx_group_settlements_status on public.group_settlements(status);

-- Add trigger to update updated_at
create or replace function update_group_settlements_updated_at()
returns trigger as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$ language plpgsql;

drop trigger if exists trigger_group_settlements_updated_at on public.group_settlements;
create trigger trigger_group_settlements_updated_at
  before update on public.group_settlements
  for each row
  execute function update_group_settlements_updated_at();
