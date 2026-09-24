const express = require("express");
const db = require("../db");

const router = express.Router();

function getValidUserId(val) {
    const parsed = parseInt(val, 10);
    return isNaN(parsed) || parsed <= 0 ? 1 : parsed;
}

// ─── GET ALL EXPENSES FOR A USER ────────────────────────────────────────────
router.get("/expenses", (req, res) => {
    const { userId, month } = req.query;
    if (!userId) return res.json({ success: false, message: "ต้องระบุ userId" });

    const uid = getValidUserId(userId);
    let sql = "SELECT * FROM expenses WHERE user_id = ?";
    const params = [uid];

    if (month) {
        sql += " AND DATE_FORMAT(date, '%Y-%m') = ?";
        params.push(month);
    }

    sql += " ORDER BY date DESC, created_at DESC";

    db.query(sql, params, (err, result) => {
        if (err) return res.status(500).json({ success: false, message: "เกิดข้อผิดพลาด", error: err });
        res.json({ success: true, data: result });
    });
});

// ─── GET TODAY's EXPENSES ────────────────────────────────────────────────────
router.get("/expenses/today", (req, res) => {
    const { userId } = req.query;
    if (!userId) return res.json({ success: false, message: "ต้องระบุ userId" });

    const uid = getValidUserId(userId);
    const sql = "SELECT * FROM expenses WHERE user_id = ? AND date = CURDATE() AND type = 'expense'";
    db.query(sql, [uid], (err, result) => {
        if (err) return res.status(500).json({ success: false, message: "เกิดข้อผิดพลาด" });
        res.json({ success: true, data: result });
    });
});

// ─── ADD EXPENSE / INCOME ────────────────────────────────────────────────────
router.post("/expenses", (req, res) => {
    console.log("POST /expenses body:", req.body);
    const { userId, title, amount, type, category, note, date } = req.body;

    if (!userId || !amount || !type) {
        return res.json({ success: false, message: "กรอกข้อมูลไม่ครบ" });
    }

    const uid = getValidUserId(userId);
    const formattedDate = date ? String(date).split("T")[0] : new Date().toISOString().split("T")[0];
    const sql = `
        INSERT INTO expenses (user_id, title, amount, type, category, note, date)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    const params = [uid, title || "", amount, type, category || "อื่นๆ", note || "", formattedDate];

    db.query(sql, params, (err, result) => {
        if (err) {
            console.error("POST /expenses DB ERROR:", err);
            return res.status(500).json({ success: false, message: "บันทึกไม่สำเร็จ", error: err });
        }
        res.json({ success: true, message: "บันทึกสำเร็จ", id: result.insertId });
    });
});

// ─── UPDATE EXPENSE ──────────────────────────────────────────────────────────
router.put("/expenses/:id", (req, res) => {
    const { id } = req.params;
    const { title, amount, type, category, note, date } = req.body;
    const formattedDate = date ? String(date).split("T")[0] : new Date().toISOString().split("T")[0];

    const sql = `
        UPDATE expenses SET title=?, amount=?, type=?, category=?, note=?, date=?
        WHERE id=?
    `;
    db.query(sql, [title, amount, type, category, note, formattedDate, id], (err) => {
        if (err) return res.status(500).json({ success: false, message: "แก้ไขไม่สำเร็จ" });
        res.json({ success: true, message: "แก้ไขสำเร็จ" });
    });
});

// ─── DELETE EXPENSE ──────────────────────────────────────────────────────────
router.delete("/expenses/:id", (req, res) => {
    const { id } = req.params;
    db.query("DELETE FROM expenses WHERE id = ?", [id], (err) => {
        if (err) return res.status(500).json({ success: false, message: "ลบไม่สำเร็จ" });
        res.json({ success: true, message: "ลบสำเร็จ" });
    });
});

// ─── GET MONTHLY SUMMARY ─────────────────────────────────────────────────────
router.get("/summary", (req, res) => {
    const { userId, month } = req.query;
    if (!userId || !month) return res.json({ success: false, message: "ต้องระบุ userId และ month" });

    const uid = getValidUserId(userId);
    const totalSql = `
        SELECT type, SUM(amount) as total
        FROM expenses
        WHERE user_id = ? AND DATE_FORMAT(date, '%Y-%m') = ?
        GROUP BY type
    `;
    const categorySql = `
        SELECT category, SUM(amount) as total
        FROM expenses
        WHERE user_id = ? AND DATE_FORMAT(date, '%Y-%m') = ? AND type = 'expense'
        GROUP BY category
        ORDER BY total DESC
    `;
    const dailySql = `
        SELECT DAY(date) as day, SUM(amount) as total
        FROM expenses
        WHERE user_id = ? AND DATE_FORMAT(date, '%Y-%m') = ? AND type = 'expense'
        GROUP BY DAY(date)
        ORDER BY day ASC
    `;

    db.query(totalSql, [uid, month], (err, totals) => {
        if (err) return res.status(500).json({ success: false });

        db.query(categorySql, [uid, month], (err2, categories) => {
            if (err2) return res.status(500).json({ success: false });

            db.query(dailySql, [uid, month], (err3, daily) => {
                if (err3) return res.status(500).json({ success: false });

                let totalIncome = 0, totalExpense = 0;
                totals.forEach(t => {
                    if (t.type === "income") totalIncome = Number(t.total);
                    if (t.type === "expense") totalExpense = Number(t.total);
                });

                res.json({
                    success: true,
                    data: {
                        totalIncome,
                        totalExpense,
                        balance: totalIncome - totalExpense,
                        byCategory: categories,
                        byDay: daily,
                    }
                });
            });
        });
    });
});

// ─── GET BUDGET ──────────────────────────────────────────────────────────────
router.get("/budget", (req, res) => {
    const { userId } = req.query;
    if (!userId) return res.json({ success: false, message: "ต้องระบุ userId" });

    const uid = getValidUserId(userId);
    db.query("SELECT * FROM budgets WHERE user_id = ?", [uid], (err, result) => {
        if (err) return res.status(500).json({ success: false });
        if (result.length === 0) {
            return res.json({ success: true, data: { daily_budget: 0, monthly_budget: 0 } });
        }
        res.json({ success: true, data: result[0] });
    });
});

// ─── SET / UPDATE BUDGET ─────────────────────────────────────────────────────
router.post("/budget", (req, res) => {
    const { userId, dailyBudget, monthlyBudget } = req.body;
    if (!userId) return res.json({ success: false, message: "ต้องระบุ userId" });

    const uid = getValidUserId(userId);
    const sql = `
        INSERT INTO budgets (user_id, daily_budget, monthly_budget)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE daily_budget = VALUES(daily_budget), monthly_budget = VALUES(monthly_budget)
    `;
    db.query(sql, [uid, dailyBudget || 0, monthlyBudget || 0], (err) => {
        if (err) return res.status(500).json({ success: false, message: "บันทึกไม่สำเร็จ" });
        res.json({ success: true, message: "บันทึกงบประมาณสำเร็จ" });
    });
});

// ─── GET CATEGORY BUDGETS ─────────────────────────────────────────────────────
router.get("/budget/category", (req, res) => {
    const { userId, month } = req.query;
    if (!userId || !month) return res.json({ success: false, message: "ต้องระบุ userId และ month" });

    const uid = getValidUserId(userId);
    const sql = "SELECT category, amount FROM category_budgets WHERE user_id = ? AND month = ?";
    db.query(sql, [uid, month], (err, result) => {
        if (err) return res.status(500).json({ success: false });
        res.json({ success: true, data: result });
    });
});

// ─── SET CATEGORY BUDGET ──────────────────────────────────────────────────────
router.post("/budget/category", (req, res) => {
    const { userId, category, amount, month } = req.body;
    if (!userId || !category || !month) return res.json({ success: false });

    const uid = getValidUserId(userId);
    const sql = `
        INSERT INTO category_budgets (user_id, category, amount, month)
        VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE amount = VALUES(amount)
    `;
    db.query(sql, [uid, category, amount, month], (err) => {
        if (err) return res.status(500).json({ success: false, error: err });
        res.json({ success: true });
    });
});

module.exports = router;
