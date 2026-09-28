/**
 * balanceCalculator.js
 * ---------------------
 * ชั้นเชื่อมระหว่าง allocationUtils (คำนวณยอดต่อบิล/ต่อสมาชิก)
 * กับ debtSimplifier (ลดจำนวนธุรกรรมการโอน)
 *
 * หน้าที่: รวมหลายบิลในกลุ่มเดียวกัน -> คำนวณ net balance ต่อคน
 * balance > 0 = ควรได้เงินคืน (จ่ายไปเกินส่วนของตัวเอง)
 * balance < 0 = เป็นหนี้ (จ่ายน้อยกว่าส่วนของตัวเอง)
 */

const { toSatang, toBaht } = require('./allocationUtils');

/**
 * @param {Array<{
 *   billId: string,
 *   paidBy: string,              // memberId ที่สำรองจ่ายบิลนี้
 *   members: Object              // ผลลัพธ์จาก allocateToMembers(...).members
 * }>} bills
 * @returns {Array<{person: string, amount: number}>} balances พร้อมส่งเข้า simplifyDebts
 */
function calculateGroupBalances(bills) {
  if (!Array.isArray(bills) || bills.length === 0) {
    return [];
  }

  const balanceSatang = {}; // memberId -> satang (บวก=ได้คืน, ลบ=เป็นหนี้)

  const ensure = (id) => {
    if (!(id in balanceSatang)) balanceSatang[id] = 0;
  };

  for (const bill of bills) {
    const { billId, paidBy, members } = bill;

    if (!paidBy) {
      throw new Error(`bill "${billId}" ไม่มีระบุ paidBy`);
    }
    if (!members || Object.keys(members).length === 0) {
      throw new Error(`bill "${billId}" ไม่มีข้อมูล members`);
    }

    ensure(paidBy);

    // แต่ละคนในบิลนี้ "เป็นหนี้" เท่ากับส่วนของตัวเอง (total)
    // ยกเว้นคนที่จ่ายเงินจริง (paidBy) ซึ่งจ่ายแทนทุกคนไปก่อน
    for (const [memberId, share] of Object.entries(members)) {
      ensure(memberId);
      const shareSatang = toSatang(share.total);

      if (memberId === paidBy) {
        // คนจ่ายเงิน: จ่ายเต็มบิล แต่ส่วนของตัวเองไม่ถือเป็นหนี้ใคร
        // -> ยอดที่ "ให้คนอื่นยืมไป" คือเต็มบิล ลบด้วยส่วนของตัวเอง
        continue; // จะคำนวณ paidBy รวมด้านล่างจากยอดเต็มบิล
      }

      // คนอื่นเป็นหนี้ paidBy เท่ากับส่วนของตัวเอง
      balanceSatang[memberId] -= shareSatang;
      balanceSatang[paidBy] += shareSatang;
    }
  }

  const balances = Object.entries(balanceSatang).map(([person, satang]) => ({
    person,
    amount: toBaht(satang),
  }));

  return balances;
}

module.exports = {
  calculateGroupBalances,
};