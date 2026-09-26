-- Migration: เพิ่มคอลัมน์ vat, service_charge, net_amount ใน personal_transactions
-- สำหรับฟีเจอร์ดึง VAT/Service Charge จากใบเสร็จ (OCR)

ALTER TABLE personal_transactions
  ADD COLUMN IF NOT EXISTS vat NUMERIC(10, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS service_charge NUMERIC(10, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_amount NUMERIC(10, 2) DEFAULT 0;