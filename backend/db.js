const mysql = require("mysql2");

const db = mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : "Paer",       // ถ้าตั้งรหัสผ่าน MySQL ให้ใส่ตรงนี้ หรือตั้ง DB_PASSWORD
    database: process.env.DB_NAME || "expense_tracker"
});

db.connect((err) => {
    if (err) {
        console.log("เชื่อมต่อฐานข้อมูลไม่สำเร็จ");
        console.log(err);
    } else {
        console.log("เชื่อมต่อฐานข้อมูลสำเร็จ");
    }
});

module.exports = db;