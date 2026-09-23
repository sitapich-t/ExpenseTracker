const express = require("express");
const bcrypt = require("bcrypt");
const db = require("../db");

const router = express.Router();

router.post("/register", async (req, res) => {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
        return res.json({
            success: false,
            message: "กรอกข้อมูลไม่ครบ"
        });
    }

    try {
        const hashPassword = await bcrypt.hash(password, 10);

        const sql =
            "INSERT INTO users(username,email,password) VALUES(?,?,?)";

        db.query(
            sql,
            [username, email, hashPassword],
            (err, result) => {

                if (err) {
                    if (err.code === "ER_DUP_ENTRY") {
                        return res.json({
                            success: false,
                            message: "อีเมลนี้ถูกใช้งานแล้ว"
                        });
                    }

                    return res.json({
                        success: false,
                        message: "บันทึกข้อมูลไม่สำเร็จ"
                    });
                }

                res.json({
                    success: true,
                    message: "สมัครสมาชิกสำเร็จ"
                });

            }
        );

    } catch (error) {

        res.json({
            success: false,
            message: "เกิดข้อผิดพลาด"
        });

    }

});

// ================= LOGIN =================
router.post("/login", (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.json({
            success: false,
            message: "กรอกข้อมูลไม่ครบ"
        });
    }

    const sql = "SELECT * FROM users WHERE email = ?";

    db.query(sql, [email], async (err, result) => {

        if (err) {
            return res.json({
                success: false,
                message: "เกิดข้อผิดพลาด"
            });
        }

        if (result.length === 0) {
            return res.json({
                success: false,
                message: "ไม่พบผู้ใช้งาน"
            });
        }

        const user = result[0];

        const checkPassword = await bcrypt.compare(password, user.password);

        if (!checkPassword) {
            return res.json({
                success: false,
                message: "รหัสผ่านไม่ถูกต้อง"
            });
        }

        res.json({
            success: true,
            message: "เข้าสู่ระบบสำเร็จ",
            user: {
                id: user.id,
                username: user.username,
                email: user.email
            }
        });

    });
});

// ================= USER SETTINGS =================
router.get("/users/:id", (req, res) => {
    const { id } = req.params;
    const sql = "SELECT id, username, email, alert_threshold, push_enabled FROM users WHERE id = ?";
    db.query(sql, [id], (err, result) => {
        if (err || result.length === 0) return res.status(500).json({ success: false });
        res.json({ success: true, data: result[0] });
    });
});

router.put("/users/:id", (req, res) => {
    const { id } = req.params;
    const { username, alert_threshold, push_enabled } = req.body;
    
    let sql = "UPDATE users SET username = ?";
    const params = [username];
    
    if (alert_threshold !== undefined) {
        sql += ", alert_threshold = ?";
        params.push(alert_threshold);
    }
    if (push_enabled !== undefined) {
        sql += ", push_enabled = ?";
        params.push(push_enabled);
    }
    sql += " WHERE id = ?";
    params.push(id);

    db.query(sql, params, (err) => {
        if (err) return res.status(500).json({ success: false, message: "อัปเดตไม่สำเร็จ" });
        res.json({ success: true, message: "อัปเดตข้อมูลสำเร็จ" });
    });
});

module.exports = router;