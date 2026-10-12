-- update_group_spend.sql
-- =========================================
-- RPC สำหรับอัปเดต ยอดรวมของกลุ่ม แบบ atomic
-- แก้ race condition ของ read-modify-write ใน groupController
-- (เดิมอ่านค่าแล้วบวกในแอปทีละ User พร้อมกัน อาจเขียนทับกันได้)
--
-- รันใน Supabase SQL Editor (หรือ psql) ก่อน แล้ว restart ครั้งเดียว
-- หลังสร้างฟังก์ชันแล้ว REST API จะใช้ผ่าน supabase.rpc('update_group_spend', ...)
-- =========================================

CREATE OR REPLACE FUNCTION update_group_spend(p_group_id UUID, p_delta NUMERIC)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE groups
  SET total_spend = total_spend + p_delta,
      amount      = amount + p_delta
  WHERE id = p_group_id;
END;
$$;