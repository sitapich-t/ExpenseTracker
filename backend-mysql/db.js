const mysql = require("mysql2");

const db = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "Paer",       // ถ้าตั้งรหัสผ่าน MySQL ให้ใส่ตรงนี้
    database: "expense_tracker"
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