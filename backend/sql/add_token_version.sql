-- ==========================================
-- Session revocation (force logout ทุกเครื่องเมื่อรีเซ็ตรหัสผ่าน)
-- รันใน Supabase SQL Editor (manual migration ตาม convention ของ repo)
-- ==========================================

-- access token จะฝังค่านี้ใน claim "ver" —
-- เมื่อรีเซ็ตรหัสผ่าน ค่าเพิ่มขึ้น 1 → token เก่าทั้งหมดใช้ไม่ได้
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS token_version integer NOT NULL DEFAULT 0;
