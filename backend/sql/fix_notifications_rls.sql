-- sql/fix_notifications_rls.sql
-- ปลดล็อค Row Level Security (RLS) สำหรับตาราง notifications และ group_payments
--
-- เนื่องจากโปรเจกต์นี้ใช้ Custom JWT Authentication ของระบบเอง (users table + Node.js API)
-- ไม่ได้ใช้ Supabase Built-in Auth ดังนั้นฐานข้อมูลจึงต้องเปิดสิทธิ์ให้อนุญาต API ของ Node.js บันทึกข้อมูลได้
-- รันใน Supabase → SQL Editor → New query

alter table public.notifications disable row level security;
alter table public.group_payments disable row level security;
