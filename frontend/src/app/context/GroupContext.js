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
      const res = await http.post(
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
        },
        headers
      );
      if (!res.data?.success) throw new Error(res.data?.error || 'เพิ่มบิลไม่สำเร็จ');
      await refresh();
      return {
        transaction: res.data.transaction,
        // false = บันทึกบิลได้ แต่ยังเก็บผู้จ่าย/สัดส่วนไม่ได้ (ยังไม่รัน migration)
        splitSaved: res.data.split_saved !== false,
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
