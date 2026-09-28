import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SHADOWS } from '@/lib/theme';
import { useGroup } from './context/GroupContext';

// ดึงข้อมูลใหม่ทุกครั้งที่หน้านี้ถูกโฟกัส
const useFocusRefresh = (fn) => {
  useFocusEffect(
    useCallback(() => {
      fn();
    }, [fn])
  );
};

export default function GroupDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { getGroup, me, refresh } = useGroup();

  const groupId = params.groupId;
  const group = getGroup(groupId);

  // เพิ่งเข้ามาจาก join/QR อาจยังไม่มีใน state -> รอ refresh ก่อนบอกว่าไม่พบกลุ่ม
  const [refreshed, setRefreshed] = useState(false);
  useFocusRefresh(async () => {
    await refresh();
    setRefreshed(true);
  });

  const groupName = group?.name || params.groupName || 'กลุ่มของฉัน';
  const members = group?.members || [];
  const bills = group?.bills || [];
  const [note, setNote] = useState('');

  // Dynamic calculations:
  const totalAmount = bills.reduce((sum, b) => {
    return sum + (parseFloat(String(b.amount).replace(/,/g, '')) || 0);
  }, 0);

  const n = members.length || 1;
  const perPerson = Math.round((totalAmount / n) * 100) / 100;

  // เทียบด้วย id ของฉันจริง ไม่ใช่ชื่อ (ชื่อซ้ำกันได้)
  const userPaid = bills
    .filter((b) => me?.id && String(b.payer) === String(me.id))
    .reduce((sum, b) => sum + (parseFloat(String(b.amount).replace(/,/g, '')) || 0), 0);

  const netBalance = userPaid - perPerson;

  if (!group && !refreshed) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color="#6D28D9" />
          <Text style={{ marginTop: 12, color: '#64748B' }}>กำลังโหลดกลุ่ม...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!group) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Ionicons name="alert-circle-outline" size={48} color="#94A3B8" />
          <Text style={{ marginTop: 12, color: '#475569', textAlign: 'center' }}>
            ไม่พบกลุ่มนี้ หรือคุณไม่ได้เป็นสมาชิก
          </Text>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Text style={{ color: '#6D28D9' }}>ย้อนกลับ</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <>
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#1E293B" />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>{groupName}</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.bellButton}
              onPress={() =>
                router.push({ pathname: '/group-qrcode', params: { id: groupId, name: groupName } })
              }
            >
              <Ionicons name="qr-code-outline" size={20} color="#1E293B" />
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.bellButton}
              onPress={() => Alert.alert('การแจ้งเตือน', 'ไม่มีการแจ้งเตือนใหม่ในกลุ่มนี้')}
            >
              <Ionicons name="notifications-outline" size={20} color="#1E293B" />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView 
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Purple Summary Card */}
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>ยอดสรุปในกลุ่มนี้</Text>
            <Text style={styles.summaryAmount}>
              {group?.settled || totalAmount === 0
                ? '0.00'
                : Math.abs(netBalance).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Text>
            
            <View style={styles.summaryFooterRow}>
              <View style={styles.receiveStatusPill}>
                <View style={[styles.greenDot, { backgroundColor: group?.settled ? '#60A5FA' : netBalance >= 0 ? '#10B981' : '#F97316' }]} />
                <Text style={styles.receiveStatusText}>
                  {group?.settled
                    ? 'เคลียร์บิลเรียบร้อยแล้ว'
                    : totalAmount === 0
                    ? 'ยังไม่มีค่าใช้จ่าย'
                    : netBalance >= 0
                    ? 'คุณจะได้รับเงินสุทธิ'
                    : 'คุณมียอดค้างจ่าย'}
                </Text>
              </View>
              <Text style={styles.groupTotalText}>
                ยอดรวมกลุ่ม {totalAmount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </Text>
            </View>
          </View>

          {/* Settle Bill Banner CTA */}
          <TouchableOpacity 
            style={styles.settleCtaBtn}
            onPress={() => router.push({ pathname: '/settle-group', params: { groupId, groupName } })}
            activeOpacity={0.85}
          >
            <View style={styles.settleCtaLeft}>
              <Ionicons name="calculator-outline" size={22} color="#6D28D9" />
              <View style={{ marginLeft: 10 }}>
                <Text style={styles.settleCtaTitle}>เคลียร์บิลและทวงเงิน</Text>
                <Text style={styles.settleCtaSub}>คำนวณยอดสุทธิ & ส่งแจ้งเตือนทวงเงิน</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#6D28D9" />
          </TouchableOpacity>

          {/* Section 1: สมาชิกกลุ่ม */}
          <View style={styles.sectionRow}>
            <Text style={styles.sectionTitle}>สมาชิกกลุ่ม ({members.length} คน)</Text>
          </View>

          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.membersRow}
          >
            {members.map((m) => (
              <View key={m.id} style={styles.memberChip}>
                <View style={[styles.memberDot, { backgroundColor: m.color }]} />
                <Text style={styles.memberName}>{m.name}</Text>
              </View>
            ))}
          </ScrollView>

          {/* Section 2: รายการบิลกลุ่ม */}
          <View style={styles.billSectionHeader}>
            <Text style={styles.sectionTitle}>รายการบิลกลุ่ม</Text>
            <Text style={styles.totalBillSub}>
              ยอดรวม {totalAmount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Text>
          </View>

          {/* Bill List */}
          {bills.length === 0 ? (
            <View style={{ paddingVertical: 24, alignItems: 'center' }}>
              <Text style={{ color: '#94A3B8', fontSize: 13 }}>ยังไม่มีรายการบิลในกลุ่มนี้ แตะปุ่ม + เพื่อเพิ่มบิล</Text>
            </View>
          ) : (
            bills.map((bill) => (
              <View key={bill.id} style={styles.billCard}>
                <View style={styles.billIconBox}>
                  <Ionicons name="cart-outline" size={20} color="#1E293B" />
                </View>

                <View style={styles.billInfoCol}>
                  <Text style={styles.billTitle}>{bill.title}</Text>
                  <Text style={styles.billSub}>ผู้จ่าย: {bill.payer} • {bill.splitText || 'แชร์ทุกคน'}</Text>
                </View>

                <Text style={styles.billAmount}>{bill.amount}</Text>
              </View>
            ))
          )}

          {/* Section 3: Note (Optional) */}
          <View style={styles.noteSection}>
            <Text style={styles.noteLabel}>Note (Optional)</Text>
            <TextInput
              style={styles.noteInput}
              placeholder="เช่น โน้ตสำหรับกลุ่มนี้..."
              placeholderTextColor="#94A3B8"
              value={note}
              onChangeText={setNote}
            />
          </View>
        </ScrollView>

        {/* Floating Add Expense (+) Button */}
        <TouchableOpacity 
          style={styles.fabButton}
            onPress={() => router.push({ pathname: '/add-group-expense', params: { groupId, groupName } })}
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={28} color="#FFFFFF" />
        </TouchableOpacity>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  backButton: {
    padding: 6,
  },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: '#1E293B',
    textAlign: 'center',
    marginHorizontal: 10,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bellButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 90,
  },
  summaryCard: {
    backgroundColor: '#5B21B6',
    borderRadius: 20,
    padding: 20,
    marginBottom: 14,
    ...SHADOWS.medium,
  },
  summaryLabel: {
    color: '#DDD6FE',
    fontSize: 13,
    marginBottom: 6,
  },
  summaryAmount: {
    fontSize: 32,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 16,
    letterSpacing: -0.5,
  },
  summaryFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  receiveStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  greenDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
    marginRight: 6,
  },
  receiveStatusText: {
    color: '#D1FAE5',
    fontSize: 13,
    fontWeight: '500',
  },
  groupTotalText: {
    color: '#DDD6FE',
    fontSize: 13,
    fontWeight: '500',
  },
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
  settleCtaLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  settleCtaTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#5B21B6',
  },
  settleCtaSub: {
    fontSize: 11,
    color: '#7C3AED',
    marginTop: 2,
  },
  sectionRow: {
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1E293B',
  },
  membersRow: {
    flexDirection: 'row',
    paddingBottom: 16,
    gap: 8,
  },
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
  memberDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 6,
  },
  memberName: {
    fontSize: 13,
    color: '#334155',
    fontWeight: '600',
  },
  billSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 12,
  },
  totalBillSub: {
    fontSize: 13,
    color: '#6D28D9',
    fontWeight: '600',
  },
  billCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    ...SHADOWS.small,
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
  billInfoCol: {
    flex: 1,
  },
  billTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 3,
  },
  billSub: {
    fontSize: 12,
    color: '#64748B',
  },
  billAmount: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1E293B',
  },
  noteSection: {
    marginTop: 12,
  },
  noteLabel: {
    fontSize: 13,
    color: '#64748B',
    marginBottom: 6,
  },
  noteInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: '#1E293B',
  },
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
});
