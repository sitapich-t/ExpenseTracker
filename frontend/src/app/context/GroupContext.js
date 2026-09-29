import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getToken, http } from '@/lib/api';

// decode payload ของ JWT เพื่อรู้ว่า "ฉัน" คือใคร (ไม่ต้องเดาเป็นชื่อ)
const decodeJwtPayload = (token) => {
  try {
    const part = String(token || '').split('.')[1];
    if (!part) return null;
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`)
        .join('')
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
};

/**
 * เดิมเป็น mock: hardcode 3 กลุ่มไว้ใน AsyncStorage
 * ตอนนี้อ่าน/เขียนกับ backend จริง (/api/v1/groups/*)
 *
 * รูปแบบข้อมูลที่หน้าจอคาด (groups[i]):
 *   { id, name, category, description, color, settled,
 *     members: [{ id, name, color }],
 *     bills:   [{ id, title, payer, payerName, amount, splitData, type, date }] }
 */
const GroupContext = createContext(null);

// แปลงบิลเป็น multipart/form-data (ใช้ตอนบิลมีรูปสลิปแนบมาด้วย)
// backend จะ parse field ที่เป็น JSON string ให้เอง จึงต้อง JSON.stringify เอง
const buildBillFormData = (bill) => {
  const fd = new FormData();
  const put = (key, value) => {
    if (value === undefined || value === null || value === '') return;
    fd.append(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
  };

  put('title', bill.title);
  put('amount', bill.amount);
  put('type', bill.type || 'expense');
  put('merchant', bill.payerName || bill.merchant);
  put('category', bill.category);
  put('date', bill.date);
  put('paid_by', bill.payer);
  put('split_data', bill.splitData);
  put('sc_rate', bill.scRate ?? 0);
  put('vat_rate', bill.vatRate ?? 0);
  put('vat_base', bill.vatBase);
  put('slip_url', bill.slipUrl);

  if (bill.slipFile) {
    // slipFile: { uri, name, type } จาก expo-image-picker
    fd.append('slip', {
      uri: bill.slipFile.uri,
      name: bill.slipFile.name || 'slip.jpg',
      type: bill.slipFile.type || 'image/jpeg',
    });
  }

  return fd;
};

export function GroupProvider({ children }) {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // ข้อมูลผู้ใช้ปัจจุบัน: { id, name, email } — หน้า detail ใช้รู้ว่าบิลไหนเราเป็นคนจ่าย
  const [me, setMe] = useState(null);

  const loadMe = useCallback(async () => {
    const token = await getToken();
    const payload = decodeJwtPayload(token);
    let profile = null;
    try {
      const raw = await AsyncStorage.getItem('user');
      if (raw) profile = JSON.parse(raw);
    } catch {
      profile = null;
    }
    const id = payload?.id || payload?.user_id || payload?.sub || profile?.id || null;
    return {
      id,
      name: profile?.name || profile?.username || payload?.name || payload?.email || 'ฉัน',
      email: profile?.email || payload?.email || '',
    };
  }, []);

  // โหลด "ฉัน" ครั้งเดียวตอน mount (setState เกิดหลัง await เสมอ)
  useEffect(() => {
    let alive = true;
    loadMe().then((user) => {
      if (alive) setMe(user);
    });
    return () => {
      alive = false;
    };
  }, [loadMe]);

  const authHeaders = useCallback(async () => {
    const token = await getToken();
    if (!token) throw new Error('กรุณาเข้าสู่ระบบ');
    return { headers: { Authorization: `Bearer ${token}` } };
  }, []);

  // ดึงข้อมูลกลุ่ม (คืนค่า ไม่ setState) — ใช้ทั้ง mount และ refresh
  const fetchGroups = useCallback(async () => {
    const headers = await authHeaders();
    const res = await http.get('/groups/my', headers);
    const list = res.data?.groups;
    return Array.isArray(list) ? list : [];
  }, [authHeaders]);

  // เรียกเมื่อต้องการ sync ใหม่ (เช่น หลังเพิ่มบิล)
  const refresh = useCallback(async () => {
    try {
      const list = await fetchGroups();
      setGroups(list);
      setError(null);
    } catch (err) {
      setError(err.message || 'โหลดกลุ่มไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, [fetchGroups]);

  // โหลดกลุ่มครั้งแรกตอน mount
  useEffect(() => {
    let alive = true;
    fetchGroups().then(
      (list) => {
        if (!alive) return;
        setGroups(list);
        setLoading(false);
      },
      (err) => {
        if (!alive) return;
        setError(err.message || 'โหลดกลุ่มไม่สำเร็จ');
        setLoading(false);
      }
    );
    return () => {
      alive = false;
    };
  }, [fetchGroups]);

  const getGroup = useCallback(
    (groupId) => groups.find((g) => String(g.id) === String(groupId)) || null,
    [groups]
  );

  // สร้างกลุ่มใหม่ -> backend จะเพิ่มผู้สร้างเป็นสมาชิกคนแรกให้เอง
  const addGroup = useCallback(
    async ({ name, category, description, color }) => {
      const headers = await authHeaders();
      const res = await http.post('/groups/create', { name, category }, headers);
      if (!res.data?.success) throw new Error(res.data?.error || 'สร้างกลุ่มไม่สำเร็จ');

      const created = res.data.group;
      // ใช้ id จริงของฉัน (ไม่ใช่ 'me') เพราะ paid_by อ้างอิง users(id)
      const myId = me?.id;
      const myName = me?.name || 'ฉัน';

      // เติมฟิลด์ที่หน้าจอใช้ แต่ DB ไม่เก็บ
      const withUi = {
        ...created,
        color: created.icon_color || color || '#7C3AED',
        description: description || created.category,
        settled: created.status_type === 'settled',
        members: myId ? [{ id: myId, name: myName, color: '#EF4444' }] : [],
        bills: [],
      };
      setGroups((prev) => [withUi, ...prev]);
      return withUi;
    },
    [authHeaders, me]
  );

  // เพิ่มบิลลงกลุ่ม
  const addGroupBill = useCallback(
    async (groupId, bill) => {
      const headers = await authHeaders();

      // ถ้ามีรูปสลิป/อัตรา SC-VAT ส่งเป็น multipart ไปเลย (backend รับทั้ง JSON และ multipart)
      const hasFile = Boolean(bill.slipFile);
      const res = hasFile
        ? await http.postForm(`/groups/${groupId}/transactions`, buildBillFormData(bill), {
            headers: { Authorization: `Bearer ${(await getToken()) || ''}` },
          })
        : await http.post(
            `/groups/${groupId}/transactions`,
            {
              title: bill.title,
              amount: bill.amount,
              type: bill.type || 'expense',
              merchant: bill.payerName || bill.merchant || 'General',
              category: bill.category || 'General',
              date: bill.date,
              paid_by: bill.payer,
              split_data: bill.splitData || null,
              sc_rate: bill.scRate ?? 0,
              vat_rate: bill.vatRate ?? 0,
              vat_base: bill.vatBase,
              slip_url: bill.slipUrl || null,
            },
            headers
          );

      if (!res.data?.success) throw new Error(res.data?.error || 'เพิ่มบิลไม่สำเร็จ');
      await refresh();
      return {
        transaction: res.data.transaction,
        slipUrl: res.data.slip_url || null,
        // false = บันทึกบิลได้ แต่บางคอลัมน์ (SC/VAT, ผู้จ่าย, สัดส่วน, สลิป) ยังบันทึกไม่ได้
        splitSaved: res.data.split_saved !== false,
        droppedFields: res.data.dropped_fields || [],
      };
    },
    [authHeaders, refresh]
  );

  // ปิดหนี้กลุ่ม -> เปลี่ยน status_type จริงใน DB
  const settleGroup = useCallback(
    async (groupId) => {
      const headers = await authHeaders();
      const res = await http.patch(
        `/groups/${groupId}/status`,
        { status_type: 'settled' },
        headers
      );
      if (!res.data?.success) throw new Error(res.data?.error || 'ปิดหนี้ไม่สำเร็จ');
      setGroups((prev) =>
        prev.map((g) => (String(g.id) === String(groupId) ? { ...g, settled: true } : g))
      );
      return true;
    },
    [authHeaders]
  );

  const removeGroup = useCallback(
    async (groupId) => {
      const headers = await authHeaders();
      const res = await http.delete(`/groups/${groupId}`, headers);
      if (!res.data?.success) throw new Error(res.data?.error || 'ลบกลุ่มไม่สำเร็จ');
      setGroups((prev) => prev.filter((g) => String(g.id) !== String(groupId)));
    },
    [authHeaders]
  );

  return (
    <GroupContext.Provider
      value={{
        groups,
        loading,
        error,
        me,
        refresh,
        getGroup,
        addGroup,
        addGroupBill,
        settleGroup,
        removeGroup,
      }}
    >
      {children}
    </GroupContext.Provider>
  );
}

export function useGroup() {
  const ctx = useContext(GroupContext);
  if (!ctx) throw new Error('useGroup ต้องอยู่ภายใน <GroupProvider>');
  return ctx;
}
