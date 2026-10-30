/**
 * notificationController.js
 * -------------------------
 * กล่องแจ้งเตือนในแอป (ทวงเงิน / ยืนยันรับเงิน)
 */
const { notifications } = require('../repositories/notificationRepository');

const isMissingTable = (err) => {
  const msg = String(err?.message || '');
  return err?.code === '42P01' || err?.code === 'PGRST205' || /relation .* does not exist|could not find the table/i.test(msg);
};

// GET /notifications — แจ้งเตือนล่าสุด 50 รายการ + จำนวนที่ยังไม่อ่าน
exports.listMyNotifications = async (req, res) => {
  try {
    const userId = req.user.id || req.user.user_id;
    const [{ data, error }, { count, error: countErr }] = await Promise.all([
      notifications.listByUser(userId),
      notifications.countUnread(userId),
    ]);
    const err = error || countErr;
    if (err) {
      // ยังไม่รัน migration -> คืนกล่องว่าง ไม่ให้หน้าแอปพัง
      if (isMissingTable(err)) return res.json({ success: true, notifications: [], unread: 0 });
      throw err;
    }
    return res.json({ success: true, notifications: data || [], unread: count || 0 });
  } catch (err) {
    console.error('❌ List notifications error:', err);
    return res.status(500).json({ success: false, error: `Database Error: ${err.message}` });
  }
};

// PATCH /notifications/read   body: { ids? } — ไม่ส่ง ids = อ่านทั้งหมด
exports.markNotificationsRead = async (req, res) => {
  try {
    const userId = req.user.id || req.user.user_id;
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : [];
    const { error } = await notifications.markRead(userId, ids);
    if (error) {
      if (isMissingTable(error)) return res.json({ success: true });
      throw error;
    }
    return res.json({ success: true });
  } catch (err) {
    console.error('❌ Mark notifications read error:', err);
    return res.status(500).json({ success: false, error: `Database Error: ${err.message}` });
  }
};
