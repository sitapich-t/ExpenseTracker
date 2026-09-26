import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { SHADOWS } from '../theme';
import ResponsiveWrapper from '../components/ResponsiveWrapper';
import { useGroup } from './context/GroupContext';

// Default group members if none passed via route params
const DEFAULT_MEMBERS = [
  { id: '1', name: 'นนท์ (ฉัน)', color: '#EF4444' },
  { id: '2', name: 'พลอย', color: '#10B981' },
  { id: '3', name: 'เตีย', color: '#F59E0B' },
  { id: '4', name: 'มาร์ช', color: '#8B5CF6' },
];

// Default bills matching GroupDetailScreen
const DEFAULT_BILLS = [
  {
    id: 'b1',
    title: 'ค่าอาหารค่ำซีฟู้ด 🦐',
    payer: 'พลอย',
    splitText: 'แชร์ทุกคน',
    amount: '5,400',
  },
  {
    id: 'b2',
    title: 'ค่าที่พักพูลวิลล่า 🌴',
    payer: 'เตีย',
    splitText: 'แชร์ทุกคน',
    amount: '4,000',
  },
  {
    id: 'b3',
    title: 'ค่าน้ำมันรถเดินทาง 🚗',
    payer: 'มาร์ช',
    splitText: 'แชร์ทุกคน',
    amount: '3,000',
  },
];

export default function GroupSettleScreen() {
  const navigation = useNavigation();
  const route = useRoute();

  const location = route.params?.groupName || 'ทริปหัวหิน 2026 🏖️';
  const members = (route.params?.members && route.params.members.length > 0)
    ? route.params.members
    : DEFAULT_MEMBERS;
  const bills = (route.params?.bills && route.params.bills.length > 0)
    ? route.params.bills
    : DEFAULT_BILLS;

  // 2 modes matching Figma mockup: "ทั้งหมด" (raw transactions) vs "จ่าย" (debt simplification)
  const [activeTab, setActiveTab] = useState('summary'); // 'all', 'summary'
  const [remindedList, setRemindedList] = useState([]);

  // Calculate raw transactions and simplified debts dynamically
  const { rawTransactions, simplifiedDebts } = useMemo(() => {
    const memberNames = members.map((m) => m.name);
    const n = memberNames.length;
    if (n === 0) return { rawTransactions: [], simplifiedDebts: [] };

    const raw = [];
    const netBalances = {};
    memberNames.forEach((name) => {
      netBalances[name] = 0;
    });

    bills.forEach((b, bIdx) => {
      const totalAmount = parseFloat(String(b.amount).replace(/,/g, '')) || 0;
      const perPerson = Math.round((totalAmount / n) * 100) / 100;
      const payer = b.payer;

      if (netBalances[payer] !== undefined) {
        netBalances[payer] += totalAmount;
      }

      memberNames.forEach((name, mIdx) => {
        netBalances[name] -= perPerson;
        if (name !== payer) {
          raw.push({
            id: `r_${b.id || bIdx}_${mIdx}`,
            from: name,
            to: payer,
            note: b.title,
            amount: perPerson.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 }),
          });
        }
      });
    });

    // Debt Simplification (greedy matching of debtors and creditors)
    const debtors = [];
    const creditors = [];

    Object.entries(netBalances).forEach(([name, balance]) => {
      const rounded = Math.round(balance * 100) / 100;
      if (rounded < -0.01) {
        debtors.push({ name, amount: -rounded });
      } else if (rounded > 0.01) {
        creditors.push({ name, amount: rounded });
      }
    });

    const simplified = [];
    let dIdx = 0;
    let cIdx = 0;
    let sId = 1;

    while (dIdx < debtors.length && cIdx < creditors.length) {
      const debtor = debtors[dIdx];
      const creditor = creditors[cIdx];
      const amount = Math.min(debtor.amount, creditor.amount);

      if (amount > 0.01) {
        simplified.push({
          id: `s_${sId++}`,
          from: debtor.name,
          to: creditor.name,
          amount: amount.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 }),
        });
      }

      debtor.amount -= amount;
      creditor.amount -= amount;

      if (debtor.amount <= 0.01) dIdx++;
      if (creditor.amount <= 0.01) cIdx++;
    }

    return { rawTransactions: raw, simplifiedDebts: simplified };
  }, [members, bills]);

  const handleSendReminder = (debt) => {
    setRemindedList((prev) => [...prev, debt.id]);
    Alert.alert(
      '🔔 ส่งการทวงเงินเรียบร้อยแล้ว!',
      `ระบบได้ส่งการแจ้งเตือน Push Notification & SMS ทวงเงินไปยัง "${debt.from}" เพื่อโอนเงิน ฿${debt.amount} ให้กับ "${debt.to}" เรียบร้อยแล้ว`
    );
  };

  const { settleGroup } = useGroup();
  const groupId = route.params?.groupId;

  const handleSaveSettle = () => {
    Alert.alert(
      'ยืนยันการเคลียร์บิล',
      'คุณต้องการบันทึกการเคลียร์บิลทั้งหมดใช่หรือไม่? สถานะจะถูกเปลี่ยนเป็น "ชำระเรียบร้อย"',
      [
        { text: 'ยกเลิก', style: 'cancel' },
        {
          text: 'บันทึกการเคลียร์บิล',
          onPress: () => {
            if (groupId) {
              settleGroup(groupId);
            }
            Alert.alert('สำเร็จ! 🎉', 'บันทึกการเคลียร์บิลเรียบร้อยแล้ว', [
              { text: 'ตกลง', onPress: () => navigation.goBack() },
            ]);
          },
        },
      ]
    );
  };

  return (
    <ResponsiveWrapper>
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={24} color="#1E293B" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>เคลียร์บิล</Text>
          <View style={{ width: 36 }} />
        </View>

        {/* Sub-header badges: Location & Member count */}
        <View style={styles.badgeRow}>
          <View style={styles.metaBadge}>
            <Ionicons name="location-sharp" size={14} color="#6D28D9" />
            <Text style={styles.metaBadgeText}>{location}</Text>
          </View>

          <View style={styles.metaBadge}>
            <Ionicons name="people" size={14} color="#6D28D9" />
            <Text style={styles.metaBadgeText}>{members.length} คน</Text>
          </View>
        </View>

        {/* Segmented Control Pill: ทั้งหมด vs จ่าย */}
        <View style={styles.segmentContainer}>
          <TouchableOpacity
            style={[styles.segmentBtn, activeTab === 'all' && styles.segmentBtnActive]}
            onPress={() => setActiveTab('all')}
            activeOpacity={0.8}
          >
            <Text style={[styles.segmentText, activeTab === 'all' && styles.segmentTextActive]}>
              ทั้งหมด
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.segmentBtn, activeTab === 'summary' && styles.segmentBtnActive]}
            onPress={() => setActiveTab('summary')}
            activeOpacity={0.8}
          >
            <Text style={[styles.segmentText, activeTab === 'summary' && styles.segmentTextActive]}>
              จ่าย
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* View 1: ทั้งหมด (Raw Split Transactions) */}
          {activeTab === 'all' && (
            <View>
              <Text style={styles.sectionSubtitle}>
                รายการชำระย่อยตามบิลย่อย ({rawTransactions.length} รายการ)
              </Text>

              {rawTransactions.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>ยังไม่มีรายการบิลในกลุ่มนี้</Text>
                </View>
              ) : (
                rawTransactions.map((item) => (
                  <View key={item.id} style={styles.rawCard}>
                    <View style={styles.rawCardContent}>
                      {/* From -> To row */}
                      <View style={styles.personFlowRow}>
                        <View style={styles.personPillPurple}>
                          <Text style={styles.personTextPurple}>{item.from}</Text>
                        </View>
                        <Ionicons name="arrow-forward" size={14} color="#94A3B8" style={{ marginHorizontal: 6 }} />
                        <View style={styles.personPillGreen}>
                          <Text style={styles.personTextGreen}>{item.to}</Text>
                        </View>
                      </View>

                      {/* Subtitle with clock */}
                      <View style={styles.subNoteRow}>
                        <Ionicons name="time-outline" size={12} color="#94A3B8" style={{ marginRight: 4 }} />
                        <Text style={styles.subNoteText}>{item.note}</Text>
                      </View>
                    </View>

                    <View style={styles.rawCardRight}>
                      <Text style={styles.rawAmount}>฿{item.amount}</Text>
                      <Ionicons name="chevron-down" size={16} color="#CBD5E1" />
                    </View>
                  </View>
                ))
              )}
            </View>
          )}

          {/* View 2: จ่าย (Simplified Net Debts with Red Bell ทวงเงิน) */}
          {activeTab === 'summary' && (
            <View>
              <Text style={styles.sectionSubtitle}>
                สรุปยอดรวมสุทธิแบบหักลบกันแล้ว ({simplifiedDebts.length} รายการ)
              </Text>

              {simplifiedDebts.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>ไม่มีหนี้ค้างชำระในกลุ่มนี้ หรือเคลียร์บิลเรียบร้อยแล้ว ✨</Text>
                </View>
              ) : (
                simplifiedDebts.map((item) => {
                  const isReminded = remindedList.includes(item.id);
                  return (
                    <View key={item.id} style={styles.settleRowCard}>
                      {/* Left info box */}
                      <View style={styles.settleLeftBox}>
                        <View style={styles.personFlowRow}>
                          <View style={styles.personPillPurple}>
                            <Text style={styles.personTextPurple}>{item.from}</Text>
                          </View>
                          <Ionicons name="arrow-forward" size={14} color="#94A3B8" style={{ marginHorizontal: 6 }} />
                          <View style={styles.personPillGreen}>
                            <Text style={styles.personTextGreen}>{item.to}</Text>
                          </View>
                        </View>

                        <Text style={styles.settleAmount}>฿{item.amount}</Text>
                      </View>

                      {/* Red Bell Button for ทวงเงิน */}
                      <TouchableOpacity
                        style={[styles.bellBtn, isReminded && styles.bellBtnReminded]}
                        onPress={() => handleSendReminder(item)}
                        activeOpacity={0.85}
                      >
                        <Ionicons
                          name={isReminded ? 'checkmark' : 'notifications'}
                          size={20}
                          color="#FFFFFF"
                        />
                      </TouchableOpacity>
                    </View>
                  );
                })
              )}
            </View>
          )}
        </ScrollView>

        {/* Bottom Button: บันทึกการเคลียร์บิล */}
        <View style={styles.bottomBar}>
          <TouchableOpacity
            style={styles.saveSettleBtn}
            onPress={handleSaveSettle}
            activeOpacity={0.85}
          >
            <Text style={styles.saveSettleBtnText}>บันทึกการเคลียร์บิล</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </ResponsiveWrapper>
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
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
  },
  backButton: {
    padding: 6,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1E293B',
  },
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
    backgroundColor: '#F5F3FF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    gap: 4,
  },
  metaBadgeText: {
    fontSize: 13,
    color: '#6D28D9',
    fontWeight: '600',
  },
  segmentContainer: {
    flexDirection: 'row',
    backgroundColor: '#EDE9FE',
    borderRadius: 24,
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 8,
    padding: 4,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 20,
  },
  segmentBtnActive: {
    backgroundColor: '#5B21B6',
  },
  segmentText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6D28D9',
  },
  segmentTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 100,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: '#94A3B8',
    marginBottom: 12,
  },
  rawCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    ...SHADOWS.small,
  },
  rawCardContent: {
    flex: 1,
  },
  personFlowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  personPillPurple: {
    backgroundColor: '#F5F3FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  personTextPurple: {
    color: '#7C3AED',
    fontSize: 12,
    fontWeight: '700',
  },
  personPillGreen: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  personTextGreen: {
    color: '#059669',
    fontSize: 12,
    fontWeight: '700',
  },
  subNoteRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  subNoteText: {
    fontSize: 11,
    color: '#94A3B8',
  },
  rawCardRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rawAmount: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
  },
  settleRowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  settleLeftBox: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 18,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    ...SHADOWS.small,
  },
  settleAmount: {
    fontSize: 17,
    fontWeight: '800',
    color: '#1E293B',
  },
  bellBtn: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#EF4444',
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.small,
  },
  bellBtnReminded: {
    backgroundColor: '#10B981',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  saveSettleBtn: {
    backgroundColor: '#5B21B6',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    ...SHADOWS.small,
  },
  saveSettleBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  emptyContainer: {
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: '#94A3B8',
    fontSize: 14,
  },
});
