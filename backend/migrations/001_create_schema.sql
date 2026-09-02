CREATE TABLE IF NOT EXISTS users (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS categories (
    category_id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    icon_type VARCHAR(50) NOT NULL,
    type VARCHAR(10) CHECK (type IN ('income', 'expense'))
);

CREATE TABLE IF NOT EXISTS personal_transactions (
    personal_transaction_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
    category_id INT REFERENCES categories(category_id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    type VARCHAR(10) CHECK (type IN ('income', 'expense')),
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    merchant TEXT,
    transaction_date TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS personal_budgets (
    personal_budget_id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
    monthly_limit NUMERIC(12, 2) NOT NULL CHECK (monthly_limit >= 0),
    month INT CHECK (month BETWEEN 1 AND 12),
    year INT CHECK (year >= 2024),
    UNIQUE(user_id, month, year)
);