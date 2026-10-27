/**
 * config/swagger.js
 * สร้าง OpenAPI spec จาก @openapi annotations ใน routes/*.js แล้วกลับเป็น JSON
 */
const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Expense Tracker API',
      version: '1.0.0',
      description:
        'REST API สำหรับแอปบันทึกรายรับ-รายจ่าย: Personal Budgets/Transactions, Groups + Settlement, Bill Split และ Auth แบบ Stateless ด้วย OTP ทางอีเมล',
    },
    servers: [
      { url: 'http://localhost:3000', description: 'Local dev server' }
    ],
    tags: [
      { name: 'Auth', description: 'สมัครสมาชิก / ยืนยัน OTP / ล็อกอิน / รีเซ็ตรหัสผ่าน' },
      { name: 'Budgets', description: 'งบประมาณส่วนตัว (ตั้ง/แก้/ลบ/ดู)' },
      { name: 'Transactions', description: 'บันทึกรายรับ-รายจ่ายส่วนตัว + สแกนใบเสร็จ' },
      { name: 'Analytics', description: 'สรุปสถิติรายรับรายจ่าย' },
      { name: 'Groups', description: 'กลุ่มแชร์ค่าใช้จ่าย + สมาชิก + สลิป' },
      { name: 'Group Transactions', description: 'ธุรกรรมของกลุ่ม (หารจ่าย)' },
      { name: 'Settlement', description: 'คำนวณยอดสะสาง + รายการโอนเงินของกลุ่ม' },
      { name: 'Bill Split', description: 'หารบิลแบบหลายวิธี / ลดหนี้ภายในกลุ่ม' },
      { name: 'System', description: 'Health check และหน้าแรกของ API' }
    ],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }
      }
    },
    security: []
  },
  apis: ['routes/*.js', 'server.js']
};

const specs = swaggerJsdoc(options);

module.exports = specs;