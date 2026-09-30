-- sql/add_group_bill_split_columns.sql
-- Migration: เพิ่มคอลัมน์สำหรับ "หารบิลกลุ่ม" + "สลิป" + "รหัสเชิญ"
--
-- ทำไมต้องมีไฟล์นี้:
--   groupController.js เขียนคอลัมน์พวกนี้ลง group_transactions เสมอ
--   แต่ create_group_tables.sql สร้างตารางแบบ "ขั้นต่ำ" ไม่มีคอลัมน์เหล่านี้
--   ถ้าไม่รันไฟล์นี้ -> insert จะ error "column does not exist" แล้ว controller
--   จะ fallback ไปบันทึก "กลุ่มคอลัมน์พื้นฐาน" เท่านั้น ทำให้ SC/VAT, ผู้จ่าย,
--   สัดส่วน และสลิป หายเงียบ ๆ (ยังตอบ success:true กลับไป)
--
-- วิธีรัน: Supabase -> SQL Editor -> New query -> วางไฟล์นี้ -> Run
-- รันซ้ำได้ (IF NOT EXISTS ทั้งหมด) ไม่ต้อง restart server
-- หลังรันแล้ว PostgREST จะอัปเดต schema cache เองภายใน ~1 นาที

-- ============================================
-- 1) groups: รหัสเชิญ (ใช้ตอน join-group)
-- ============================================
alter table public.groups
  add column if not exists invite_code text;

-- เอาไว้กันรหัสซ้ำ แต่ปล่อย null ได้ (กลุ่มเก่าที่ยังไม่มีรหัส)
create unique index if not exists idx_groups_invite_code
  on public.groups (invite_code)
  where invite_code is not null;

-- ============================================
-- 2) group_transactions: ผู้จ่าย + SC/VAT + สัดส่วน + สลิป
-- ============================================
alter table public.group_transactions
  add column if not exists paid_by uuid references public.users (id) on delete set null,
  add column if not exists subtotal numeric(12, 2) not null default 0,
  add column if not exists sc_rate numeric(6, 3) not null default 0,
  add column if not exists sc_amount numeric(12, 2) not null default 0,
  add column if not exists vat_rate numeric(6, 3) not null default 0,
  add column if not exists vat_amount numeric(12, 2) not null default 0,
  add column if not exists split_data jsonb,
  add column if not exists slip_url text;

-- ============================================
-- 3) Backfill: เดิม subtotal เป็น 0 ทั้งตาราง
--    ยอดก่อน SC/VAT ของบิลเก่าคือ amount เท่าไร? ใช้ amount เป็นค่าเริ่มต้น
-- ============================================
update public.group_transactions
set subtotal = amount
where subtotal = 0;

-- ============================================
-- เช็คผล (ควรได้ subtotal/sc_amount/vat_amount = 0 ทุกบรรทัด)
-- ============================================
-- select count(*) filter (where subtotal = 0)     as subtotal_zero,
--        count(*) filter (where sc_amount = 0)   as sc_zero,
--        count(*) filter (where vat_amount = 0)  as vat_zero,
--        count(*) filter (where paid_by is null) as no_payer
-- from public.group_transactions;
