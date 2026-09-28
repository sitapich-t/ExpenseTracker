import AsyncStorage from '@react-native-async-storage/async-storage';
import { getToken, http } from '@/lib/api';

export const MEMBER_COLORS = [
  '#EF4444',
  '#10B981',
  '#F59E0B',
  '#8B5CF6',
  '#EC4899',
  '#0EA5E9',
  '#F97316',
  '#14B8A6',
];

export function memberColor(index) {
  return MEMBER_COLORS[index % MEMBER_COLORS.length];
}

export function parseAmount(value) {
  const parsed = parseFloat(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatBaht(value) {
  return (value ?? 0).toLocaleString('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatDate(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value ?? '');
  return parsed.toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'short',
    year: '2-digit',
  });
}

export function isExpense(transaction) {
  return (transaction?.type || 'expense') !== 'income';
}

export async function getCurrentUser() {
  try {
    const raw = await AsyncStorage.getItem('user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function currentUserId(user) {
  return user?.id ?? user?.user_id ?? null;
}

export function displayNameFor(userId, currentUser) {
  if (!userId) return 'สมาชิก';
  if (currentUser && String(userId) === String(currentUserId(currentUser))) {
    return currentUser.name ? `${currentUser.name} (ฉัน)` : 'ฉัน';
  }
  const raw = String(userId);
  return raw.length > 10 ? `${raw.slice(0, 8)}…` : raw;
}

export function authHeaders(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function fetchGroupBundle(groupId) {
  const token = await getToken();
  const headers = authHeaders(token);
  const [membersRes, transactionsRes] = await Promise.all([
    http.get(`/groups/${groupId}/members`, { headers }),
    http.get(`/groups/${groupId}/transactions`, { headers }),
  ]);
  return {
    members: Array.isArray(membersRes.data?.members) ? membersRes.data.members : [],
    transactions: Array.isArray(transactionsRes.data?.transactions)
      ? transactionsRes.data.transactions
      : [],
  };
}

export async function joinGroup(groupId, userId) {
  if (!userId) throw new Error('ไม่พบข้อมูลผู้ใช้ กรุณาเข้าสู่ระบบใหม่');
  const token = await getToken();
  const res = await http.post(
    `/groups/${groupId}/members`,
    { user_id: userId },
    { headers: authHeaders(token) }
  );
  return res.data;
}
