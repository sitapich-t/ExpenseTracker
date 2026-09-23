-- ================================================
-- Expense Tracker — MySQL Schema Setup
-- รันใน phpMyAdmin หรือ MySQL client
-- ================================================

CREATE DATABASE IF NOT EXISTS expense_tracker
    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE expense_tracker;

-- ─── Users ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    username   VARCHAR(100)  NOT NULL,
    email      VARCHAR(150)  NOT NULL UNIQUE,
    password   VARCHAR(255)  NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ─── Expenses / Income ──────────────────────────
CREATE TABLE IF NOT EXISTS expenses (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    user_id    INT           NOT NULL,
    title      VARCHAR(255)  DEFAULT '',
    amount     DECIMAL(10,2) NOT NULL,
    type       ENUM('expense','income') NOT NULL DEFAULT 'expense',
    category   VARCHAR(100)  DEFAULT 'อื่นๆ',
    note       TEXT,
    date       DATE          NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ─── Budget Settings ─────────────────────────────
CREATE TABLE IF NOT EXISTS budgets (
    id               INT AUTO_INCREMENT PRIMARY KEY,
    user_id          INT           NOT NULL UNIQUE,
    daily_budget     DECIMAL(10,2) DEFAULT 0,
    monthly_budget   DECIMAL(10,2) DEFAULT 0,
    updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ─── Index สำหรับ query เร็วขึ้น ─────────────────
CREATE INDEX idx_expenses_user_date ON expenses(user_id, date);
CREATE INDEX idx_expenses_user_type ON expenses(user_id, type);
