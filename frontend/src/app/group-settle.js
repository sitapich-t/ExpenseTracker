import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import {
  authHeaders,
  currentUserId,
  displayNameFor,
  fetchGroupBundle,
  formatBaht,
  getCurrentUser,
  isExpense,
  parseAmount,
} from '@/lib/groups';
import { getToken, http } from '@/lib/api';

export default function GroupSettleScreen() {
  const router = useRouter();
  const { id, name } = useLocalSearchParams();

  const groupId = Array.isArray(id) ? id[0] : id;
  const groupName = (Array.isArray(name) ? name[0] : name) || 'กลุ่ม';

  const [tab, setTab] = useState('settle');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [members, setMembers] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [result, setResult] = useState(null);

  const load = useCallback(async () => {
    if (!groupId) {
      setError('ไม่พบรหัสกลุ่ม กรุณากลับไปหน้ากลุ่มแล้วลองใหม่');
      setLoading(false);
      return;
    }

    try {
      setError(null);
      const user = await getCurrentUser();
      const bundle = await fetchGroupBundle(groupId);
      setCurrentUser(user);
      setMembers(bundle.members);

      const memberIds = bundle.members
        .map((m) => m.user_id)
        .filter((v) => v !== null && v !== undefined)
        .map(String);

      const myId = currentUserId(user);
      const expenses = bundle.transactions.filter(isExpense);

      if (memberIds.length === 0 || expenses.length === 0) {
        setResult(null);
        return;
      }

      const items = expenses.map((t, index) => ({
        id: t.id ?? `item-${index}`,
        price: parseAmount(t.amount),
        paidBy: memberIds.includes(String(t.created_by))
          ? String(t.created_by)
          : myId
          ? String(myId)
          : memberIds[0],
        sharedBy: memberIds,
      }));

      const token = await getToken();
      const res = await http.post(
        '/bill-split/split-bill',
        { items, scRate: 0, vatRate: 0, groupMembers: memberIds },
        { headers: authHeaders(token) }
      );

      setResult(res.data);
    } catch (err) {
      setError(
        err.response?.data?.error || err.message || 'คำนวณการเคลียร์บิลไม่สำเร็จ'
      );
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const label = useCallback(
    (personId) => displayNameFor(personId, currentUser),
    [currentUser]
  );

  const totalSpend = useMemo(() => {
    if (result?.summary?.grandTotal !== undefined) return result.summary.grandTotal;
    if (!Array.isArray(result?.items)) return 0;
    return result.items.reduce((sum, item) => sum + parseAmount(item.total), 0);
  }, [result]);

  const transfers = Array.isArray(result?.transactions) ? result.transactions : [];
  const itemDetails = Array.isArray(result?.items) ? result.items : [];

  const handleRemind = async (transfer) => {
    const from = label(transfer.from);
    const to = label(transfer.to);
    const amount = formatBaht(transfer.amount);
    try {
      await Share.share({
        message: `ขอทวงเงิน ฿${amount} สำหรับค่าใช้จ่ายในกลุ่ม "${groupName}"\n${from} → ${to}`,
      });
    } catch (err) {
      Alert.alert('ส่งข้อความไม่สำเร็จ', err.message || 'ไม่สามารถเปิดหน้าต่างแชร์ได้');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color="#1E293B" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>เคลียร์บิล</Text>
        <View style={styles.backButton} />
      </View>

      <View style={styles.badgeRow}>
        <View style={styles.metaBadge}>
          <Ionicons name="people" size={14} color="#6D28D9" />
          <Text style={styles.metaBadgeText} numberOfLines={1}>
            {groupName} · {members.length} คน
          </Text>
        </View>
        {totalSpend > 0 && (
          <View style={styles.metaBadge}>
            <Ionicons name="wallet-outline" size={14} color="#6D28D9" />
            <Text style={styles.metaBadgeText}>฿{formatBaht(totalSpend)}</Text>
          </View>
        )}
      </View>

      <View style={styles.segmentContainer}>
        <TouchableOpacity
          style={[styles.segmentBtn, tab === 'bills' && styles.segmentBtnActive]}
          onPress={() => setTab('bills')}
          activeOpacity={0.8}
        >
          <Text style={[styles.segmentText, tab === 'bills' && styles.segmentTextActive]}>
            ทั้งหมด
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.segmentBtn, tab === 'settle' && styles.segmentBtnActive]}
          onPress={() => setTab('settle')}
          activeOpacity={0.8}
        >
          <Text style={[styles.segmentText, tab === 'settle' && styles.segmentTextActive]}>
            จ่าย
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#6D28D9" />
          <Text style={styles.centeredText}>กำลังคำนวณยอดสุทธิ…</Text>
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Ionicons name="alert-circle-outline" size={40} color="#DC2626" />
          <Text style={styles.centeredText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={load}>
            <Text style={styles.retryBtnText}>ลองใหม่</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {tab === 'bills' ? (
            <View>
              <Text style={styles.sectionSubtitle}>
                รายการบิลในกลุ่ม ({itemDetails.length} รายการ)
              </Text>

              {itemDetails.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>ยังไม่มีรายการบิลในกลุ่มนี้</Text>
                </View>
              ) : (
                itemDetails.map((item, index) => {
                  const sharedCount = Array.isArray(item.sharedBy) ? item.sharedBy.length : 0;
                  const per = sharedCount > 0 ? parseAmount(item.total) / sharedCount : 0;
                  return (
                    <View key={item.id ?? index} style={styles.rawCard}>
                      <View style={styles.rawCardContent}>
                        <View style={styles.personFlowRow}>
                          <View style={styles.personPillPurple}>
                            <Text style={styles.personTextPurple} numberOfLines={1}>
                              {label(item.paidBy)}
                            </Text>
                          </View>
                          <Ionicons
                            name="arrow-forward"
                            size={14}
                            color="#94A3B8"
                            style={{ marginHorizontal: 6 }}
                          />
                          <Text style={styles.shareHint}>
                            แชร์ {sharedCount} คน · คนละ ฿{formatBaht(per)}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.rawAmount}>฿{formatBaht(item.total)}</Text>
                    </View>
                  );
                })
              )}
            </View>
          ) : (
            <View>
              <Text style={styles.sectionSubtitle}>
                สรุปยอดรวมสุทธิแบบหักลบกันแล้ว ({transfers.length} รายการ)
              </Text>

              {transfers.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Ionicons name="checkmark-circle-outline" size={38} color="#10B981" />
                  <Text style={styles.emptyText}>
                    ไม่มีหนี้ค้างชำระในกลุ่มนี้ หรือเคลียร์บิลเรียบร้อยแล้ว
                  </Text>
                </View>
              ) : (
                transfers.map((transfer, index) => (
                  <View key={`${transfer.from}-${transfer.to}-${index}`} style={styles.settleRowCard}>
                    <View style={styles.settleLeftBox}>
                      <View style={styles.personFlowRow}>
                        <View style={styles.personPillPurple}>
                          <Text style={styles.personTextPurple} numberOfLines={1}>
                            {label(transfer.from)}
                          </Text>
                        </View>
                        <Ionicons
                          name="arrow-forward"
                          size={14}
                          color="#94A3B8"
                          style={{ marginHorizontal: 6 }}
                        />
                        <View style={styles.personPillGreen}>
                          <Text style={styles.personTextGreen} numberOfLines={1}>
                            {label(transfer.to)}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.settleAmount}>
                        ฿{formatBaht(transfer.amount)}
                      </Text>
                    </View>

                    <TouchableOpacity
                      style={styles.bellBtn}
                      onPress={() => handleRemind(transfer)}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="notifications-outline" size={20} color="#FFFFFF" />
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </View>
          )}

          <View style={{ height: 32 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F8FAFC' },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
  },
  backButton: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#1E293B' },

  badgeRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 10,
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  metaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F5F3FF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    flexShrink: 1,
  },
  metaBadgeText: { fontSize: 13, color: '#6D28D9', fontWeight: '600', flexShrink: 1 },

  segmentContainer: {
    flexDirection: 'row',
    backgroundColor: '#EDE9FE',
    borderRadius: 24,
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 8,
    padding: 4,
  },
  segmentBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 20 },
  segmentBtnActive: { backgroundColor: '#5B21B6' },
  segmentText: { fontSize: 14, fontWeight: '600', color: '#6D28D9' },
  segmentTextActive: { color: '#FFFFFF', fontWeight: '700' },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  centeredText: { fontSize: 14, color: '#64748B', textAlign: 'center' },
  retryBtn: { backgroundColor: '#5B21B6', paddingHorizontal: 28, paddingVertical: 10, borderRadius: 12 },
  retryBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },

  scrollContent: { paddingHorizontal: 20, paddingTop: 14 },
  sectionSubtitle: { fontSize: 12, color: '#94A3B8', marginBottom: 12 },

  rawCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  rawCardContent: { flex: 1 },
  rawAmount: { fontSize: 16, fontWeight: '700', color: '#1E293B' },

  personFlowRow: { flexDirection: 'row', alignItems: 'center' },
  personPillPurple: { backgroundColor: '#F5F3FF', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, maxWidth: 110 },
  personTextPurple: { color: '#7C3AED', fontSize: 12, fontWeight: '700' },
  personPillGreen: { backgroundColor: '#ECFDF5', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, maxWidth: 110 },
  personTextGreen: { color: '#059669', fontSize: 12, fontWeight: '700' },
  shareHint: { flex: 1, fontSize: 12, color: '#64748B' },

  settleRowCard: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  settleLeftBox: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 18,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  settleAmount: { fontSize: 17, fontWeight: '800', color: '#1E293B' },
  bellBtn: { width: 48, height: 48, borderRadius: 14, backgroundColor: '#EF4444', justifyContent: 'center', alignItems: 'center' },

  emptyContainer: { paddingVertical: 40, alignItems: 'center', justifyContent: 'center', gap: 10 },
  emptyText: { color: '#94A3B8', fontSize: 14, textAlign: 'center' },
});
