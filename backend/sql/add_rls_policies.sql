-- sql/add_rls_policies.sql
-- ปลดล็อกสิทธิ์ตาราง notifications และ group_payments ให้ Backend เข้าถึงได้ 100%
-- รันใน Supabase → SQL Editor → New query

ALTER TABLE public.notifications DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_payments DISABLE ROW LEVEL SECURITY;

-- เผื่อกรณีที่ต้องการเปิด RLS ไว้ สามารถใช้นโยบายแบบ Full Access ได้เช่นกัน:
DROP POLICY IF EXISTS "allow_all_notifications" ON public.notifications;
CREATE POLICY "allow_all_notifications" ON public.notifications FOR ALL TO public, anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "allow_all_group_payments" ON public.group_payments;
CREATE POLICY "allow_all_group_payments" ON public.group_payments FOR ALL TO public, anon, authenticated USING (true) WITH CHECK (true);
