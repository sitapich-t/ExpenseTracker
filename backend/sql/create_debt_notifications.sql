-- sql/create_debt_notifications.sql
-- Migration: ระบบทวงเงิน + ยืนยันรับเงินในกลุ่ม
--
-- 1) group_payments  : บันทึก "เจ้าหนี้ยืนยันว่าได้รับเงินแล้ว"
--                      settlement จะนำยอดนี้ไปหักออกจากหนี้ก่อนคำนวณ debt simplification
-- 2) notifications   : กล่องแจ้งเตือนในแอป (ทวงเงิน / ยืนยันรับเงิน)
--
-- รันใน Supabase → SQL Editor → New query
-- (ถ้ายังไม่รัน: settlement ยังทำงานได้ตามเดิม แต่ปุ่มทวงเงิน/ยืนยันรับเงินจะตอบ 503)

-- ============================================
-- 1) GROUP_PAYMENTS
-- ============================================
create table if not exists public.group_payments (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  from_user uuid not null references public.users (id) on delete cascade,  -- ลูกหนี้ (คนโอน)
  to_user uuid not null references public.users (id) on delete cascade,    -- เจ้าหนี้ (คนรับเงิน)
  amount numeric(12, 2) not null check (amount > 0),
  confirmed_by uuid references public.users (id) on delete set null,
  confirmed_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_group_payments_group on public.group_payments (group_id);

-- ============================================
-- 2) NOTIFICATIONS
-- ============================================
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,     -- ผู้รับแจ้งเตือน
  sender_id uuid references public.users (id) on delete set null,           -- ผู้ส่ง
  group_id uuid references public.groups (id) on delete cascade,
  type text not null,                                                       -- debt_reminder | payment_confirmed
  title text not null,
  message text not null,
  amount numeric(12, 2),
  is_read boolean not null default false,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_notifications_user
  on public.notifications (user_id, is_read, created_at desc);
