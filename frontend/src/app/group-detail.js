import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import {
  currentUserId,
  displayNameFor,
  fetchGroupBundle,
  formatBaht,
  formatDate,
  getCurrentUser,
  isExpense,
  memberColor,
  parseAmount,
} from '@/lib/groups';

export default function GroupDetailScreen() {
  const router = useRouter();
  const { id, name } = useLocalSearchParams();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [members, setMembers] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);

  const groupId = Array.isArray(id) ? id[0] : id;
  const groupName = (Array.isArray(name) ? name[0] : name) || 'กลุ่ม';

  const fetchGroup = useCallback(async () => {
    if (!groupId) {
      setError('ไม่พบรหัสกลุ่ม กรุณากลับไปหน้ากลุ่มแล้วลองใหม่');
      setLoading(false);
      return;
    }

    try {
      setError(null);
      const [user, bundle] = await Promise.all([
        getCurrentUser(),
        fetchGroupBundle(groupId),
      ]);
      setCurrentUser(user);
      setMembers(bundle.members);
      setTransactions(bundle.transactions);
    } catch (err) {
      const status = err.response?.status;
      setError(
        status === 401
          ? 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่'
          : err.response?.data?.error || err.message || 'โหลดข้อมูลกลุ่มไม่สำเร็จ'
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [groupId]);

  useFocusEffect(
    useCallback(() => {
      fetchGroup();
    }, [fetchGroup])
  );

  const expenses = transactions.filter(isExpense);

  const totalAmount = expenses.reduce((sum, t) => sum + parseAmount(t.amount), 0);
  const memberCount = members.length || 1;
  const perPerson = totalAmount / memberCount;

  const myId = currentUserId(currentUser);
  const userPaid = expenses
    .filter((t) => myId && String(t.created_by) === String(myId))
    .reduce((sum, t) => sum + parseAmount(t.amount), 0);

  const netBalance = userPaid - perPerson;

  const balanceLabel =
    totalAmount === 0
      ? 'ยังไม่มีค่าใช้จ่าย'
      : netBalance >= 0
        ? 'คุณจะได้รับเงินสุทธิ'
        : 'คุณมียอดค้างจ่าย';

  const balanceColor =
    totalAmount === 0 ? '#60A5FA' : netBalance >= 0 ? '#10B981' : '#F97316';

  const handleRefresh = () => {
    setRefreshing(true);
    fetchGroup();
  };

  const groupParams = { id: groupId, name: groupName };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color="#1E293B" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {groupName}
        </Text>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.push({ pathname: '/group-qrcode', params: groupParams })}
        >
          <Ionicons name="qr-code-outline" size={22} color="#1E293B" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#6D28D9" />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Ionicons name="alert-circle-outline" size={44} color="#DC2626" />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={fetchGroup}>
            <Text style={styles.retryBtnText}>ลองใหม่</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
        >
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>ยอดสุทธิของคุณในกลุ่มนี้</Text>
            <Text style={styles.summaryAmount}>
              ฿{formatBaht(Math.abs(netBalance))}
            </Text>
            <View style={styles.summaryFooterRow}>
              <View style={styles.statusPill}>
                <View
                  style={[styles.statusDot, { backgroundColor: balanceColor }]}
                />
                <Text style={styles.statusText}>{balanceLabel}</Text>
              </View>
              <Text style={styles.groupTotalText}>
                ยอดรวมกลุ่ม ฿{formatBaht(totalAmount)}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.settleCtaBtn}
            onPress={() => router.push({ pathname: '/group-settle', params: groupParams })}
            activeOpacity={0.85}
          >
            <View style={styles.settleCtaLeft}>
              <Ionicons name="calculator-outline" size={22} color="#6D28D9" />
              <View style={{ marginLeft: 10 }}>
                <Text style={styles.settleCtaTitle}>เคลียร์บิลและทวงเงิน</Text>
                <Text style={styles.settleCtaSub}>คำนวณยอดสุทธิ &amp; ส่งแจ้งเตือนทวงเงิน</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#6D28D9" />
          </TouchableOpacity>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              สมาชิกกลุ่ม ({members.length} คน)
            </Text>
            <Text style={styles.sectionHint}>
              เฉลี่ย ฿{formatBaht(perPerson)} / คน
            </Text>
          </View>

          {members.length === 0 ? (
            <Text style={styles.emptyHint}>ยังไม่มีข้อมูลสมาชิกในกลุ่มนี้</Text>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.membersRow}
            >
              {members.map((member, index) => (
                <View key={member.id ?? member.user_id ?? index} style={styles.memberChip}>
                  <View
                    style={[styles.memberDot, { backgroundColor: memberColor(index) }]}
                  />
                  <Text style={styles.memberName}>
                    {displayNameFor(member.user_id, currentUser)}
                  </Text>
                </View>
              ))}
            </ScrollView>
          )}

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>รายการบิลกลุ่ม</Text>
            <Text style={styles.sectionHint}>
              {expenses.length} รายการ · ฿{formatBaht(totalAmount)}
            </Text>
          </View>

          {expenses.length === 0 ? (
            <View style={styles.emptyBills}>
              <Ionicons name="receipt-outline" size={34} color="#CBD5E1" />
              <Text style={styles.emptyHint}>
                ยังไม่มีรายการบิลในกลุ่มนี้
              </Text>
            </View>
          ) : (
            expenses.map((transaction) => (
              <View
                key={transaction.id ?? `${transaction.title}-${transaction.transaction_date}`}
                style={styles.billCard}
              >
                <View style={styles.billIconBox}>
                  <Ionicons
                    name={
                      transaction.category === 'Food'
                        ? 'restaurant-outline'
                        : 'cart-outline'
                    }
                    size={20}
                    color="#1E293B"
                  />
                </View>
                <View style={styles.billInfoCol}>
                  <Text style={styles.billTitle} numberOfLines={1}>
                    {transaction.title || transaction.merchant || 'รายการ'}
                  </Text>
                  <Text style={styles.billSub} numberOfLines={1}>
                    {transaction.merchant || 'General'}
                    {transaction.transaction_date
                      ? ` · ${formatDate(transaction.transaction_date)}`
                      : ''}
                  </Text>
                </View>
                <Text style={styles.billAmount}>
                  ฿{formatBaht(parseAmount(transaction.amount))}
                </Text>
              </View>
            ))
          )}

          <View style={{ height: 96 }} />
        </ScrollView>
      )}

      <TouchableOpacity
        style={styles.fabButton}
        onPress={() => router.push({ pathname: '/add-group-expense', params: groupParams })}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={28} color="#FFFFFF" />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F8FAFC' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  backButton: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: '#1E293B', textAlign: 'center' },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 12 },
  errorText: { fontSize: 14, color: '#64748B', textAlign: 'center' },
  retryBtn: { marginTop: 4, backgroundColor: '#5B21B6', paddingHorizontal: 28, paddingVertical: 10, borderRadius: 12 },
  retryBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },

  scrollContent: { paddingHorizontal: 16, paddingTop: 16 },

  summaryCard: {
    backgroundColor: '#5B21B6',
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#5B21B6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 5,
  },
  summaryLabel: { color: '#DDD6FE', fontSize: 13, marginBottom: 6 },
  summaryAmount: { fontSize: 32, fontWeight: '800', color: '#FFFFFF', marginBottom: 16, letterSpacing: -0.5 },
  summaryFooterRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statusPill: { flexDirection: 'row', alignItems: 'center' },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  statusText: { color: '#D1FAE5', fontSize: 13, fontWeight: '500' },
  groupTotalText: { color: '#DDD6FE', fontSize: 13, fontWeight: '500' },

  settleCtaBtn: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#EDE9FE',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#DDD6FE',
  },
  settleCtaLeft: { flexDirection: 'row', alignItems: 'center' },
  settleCtaTitle: { fontSize: 14, fontWeight: '700', color: '#5B21B6' },
  settleCtaSub: { fontSize: 11, color: '#7C3AED', marginTop: 2 },

  fabButton: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#5B21B6',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#5B21B6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 6,
  },

  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#1E293B' },
  sectionHint: { fontSize: 12, color: '#6D28D9', fontWeight: '600' },

  membersRow: { flexDirection: 'row', paddingBottom: 16, gap: 8 },
  memberChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  memberDot: { width: 10, height: 10, borderRadius: 5, marginRight: 6 },
  memberName: { fontSize: 13, color: '#334155', fontWeight: '600' },

  emptyBills: { alignItems: 'center', gap: 8, paddingVertical: 28 },
  emptyHint: { fontSize: 13, color: '#94A3B8', textAlign: 'center' },

  billCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  billIconBox: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  billInfoCol: { flex: 1, marginRight: 8 },
  billTitle: { fontSize: 14, fontWeight: '700', color: '#1E293B', marginBottom: 3 },
  billSub: { fontSize: 12, color: '#64748B' },
  billAmount: { fontSize: 15, fontWeight: '700', color: '#1E293B' },
});
