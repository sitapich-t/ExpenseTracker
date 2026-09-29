-- ============================================
-- Student Wallet — Group bill-split columns
-- Adds the columns groupController.createGroupTransaction already writes
-- but that create_group_tables.sql never declared, so
-- POST /api/v1/groups/:id/transactions could never succeed.
--
-- Context: group_transactions stores a bill. The bill-split feature
-- (allocationUtils / balanceCalculator / debtSimplifier) needs to know
--   - who paid          -> paid_by
--   - which members shared, and how -> split_data (jsonb)
-- Those had no home, so the group split/settle UI had nothing to read.
--
-- Apply:  node sql/apply.js sql/add_group_bill_split_columns.sql
--    or:  paste into Supabase → SQL Editor
-- Safe to re-run (all IF NOT EXISTS).
-- ============================================

alter table public.group_transactions
  add column if not exists subtotal   numeric(12, 2) not null default 0,
  add column if not exists sc_rate    numeric(6, 2)  not null default 0,
  add column if not exists sc_amount  numeric(12, 2) not null default 0,
  add column if not exists vat_rate   numeric(6, 2)  not null default 0,
  add column if not exists vat_amount numeric(12, 2) not null default 0,
  add column if not exists slip_url   text,
  add column if not exists paid_by    uuid references public.users (id) on delete set null,
  add column if not exists split_data jsonb;

-- ใช้ค้นหา "ฉันจ่ายบิลอะไรบ้าง" ในหน้า settle
create index if not exists idx_group_tx_paid_by
  on public.group_transactions (group_id, paid_by);

-- ============================================
-- Invite code: ให้หน้า join-group กรอกรหัสแล้วเข้ากลุ่มได้จริง
-- 6 ตัวอักษร/ตัวเลข เช่น GR829A (ตัวอักษร 2 + ตัวเลข/อักษร 4)
-- ============================================
alter table public.groups
  add column if not exists invite_code text;

-- ต้องไม่ซ้ำ และค้นหาได้เร็ว
create unique index if not exists idx_groups_invite_code
  on public.groups (invite_code)
  where invite_code is not null;

-- กลุ่มที่มีอยู่ก่อนหน้านี้ยังไม่มีรหัสเชิญ -> สร้างให้ด้วย
-- ใช้ 5 หลัก md5 (GR + 5 = 7 ตัว) เพื่อกันชนกันสำคัญ
-- รหัสของกลุ่มใหม่ที่ app สร้างจะยังเป็น 6 ตัวตามปกติ (ค้นหาแบบตรงตัว จึงรองรับได้ทั้งสองแบบ)
update public.groups
set invite_code = 'GR' || upper(substr(md5(random()::text || id::text), 1, 5))
where invite_code is null;

-- ============================================
-- สำคัญมาก: PostgREST แคช schema ไว้
-- ถ้าไม่ reload หลังรัน DDL แล้ว API จะยังตอบว่า
-- "Could not find the 'invite_code' column of 'groups' in the schema cache"
-- แม้คอลัมน์จะถูกสร้างไปแล้ว -> ต้องรันบรรทัดนี้ทุกครั้งที่แก้ schema
-- ============================================
notify pgrst, 'reload schema';

-- ============================================
-- ตรวจสอบผลลัพธ์ (ดูผลใน Results grid ด้านล่าง)
-- ต้องเห็น invite_code ✔ และ paid_by ✔ / split_data ✔ ก่อนใช้งานได้
-- ============================================
select 'groups.invite_code'      as "คอลัมน์", count(*) > 0 as "มีแล้ว?" from information_schema.columns
  where table_schema = 'public' and table_name = 'groups'      and column_name = 'invite_code'
union all
select 'group_transactions.paid_by', count(*) > 0 from information_schema.columns
  where table_schema = 'public' and table_name = 'group_transactions' and column_name = 'paid_by'
union all
select 'group_transactions.split_data', count(*) > 0 from information_schema.columns
  where table_schema = 'public' and table_name = 'group_transactions' and column_name = 'split_data';

-- ดูรหัสเชิญของกลุ่มทั้งหมด
select id, name, invite_code from public.groups order by created_at desc;

