-- Supabase/Postgres schema migration: create users and transactions tables

-- Enable pgcrypto for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Transactions table
CREATE TABLE IF NOT EXISTS transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  type text NOT NULL CHECK (type IN ('income', 'expense')),
  amount numeric(12,2) NOT NULL DEFAULT 0,
  merchant text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_transactions_user_id_created_at ON transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_merchant ON transactions(merchant);

-- Optional: a view for quick dashboard summary per user
CREATE OR REPLACE VIEW user_dashboard_summary AS
SELECT
  t.user_id,
  COUNT(*) FILTER (WHERE t.type = 'expense') AS expenses_count,
  COUNT(*) FILTER (WHERE t.type = 'income') AS incomes_count,
  COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'expense'), 0) AS total_expenses,
  COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'income'), 0) AS total_incomes
FROM transactions t
GROUP BY t.user_id;
