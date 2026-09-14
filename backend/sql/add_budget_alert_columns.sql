-- sql/add_budget_alert_columns.sql
alter table personal_budgets add column if not exists last_notified_level text default 'NORMAL';
alter table personal_budgets add column if not exists notified_at timestamptz;