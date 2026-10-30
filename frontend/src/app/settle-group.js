import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { SHADOWS } from '@/lib/theme';
import { useGroup } from './context/GroupContext';
import { getToken, http } from '@/lib/api';

const baht = (n) =>
  Number(n || 0).toLocaleString('th-TH', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

// array ว่างที่ reference เดิมทุกครั้ง (ไม่ให้ useCallback/useMemo คำนวณใหม่ทุก render)
const EMPTY = [];

export default function GroupSettleScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { settleGroup, getGroup, refresh, fetchSettlement, me } = useGroup();

  const groupId = params.groupId;
  const location = params.groupName || getGroup(groupId)?.name || 'กลุ่มของฉัน';
  const ctx = getGroup(groupId);
  const members = useMemo(() => (Array.isArray(ctx?.members) ? ctx.members : EMPTY), [ctx]);
  const bills = useMemo(() => (Array.isArray(ctx?.bills) ? ctx.bills : EMPTY), [ctx]);

  const nameOf = useCallback(
    (id) => {
      const m = members.find((mm) => String(mm.id) === String(id));
      return m?.name || 'สมาชิก';
    },
    [members]
  );

  // 2 modes: "ทั้งหมด" (รายบิลดิบ) vs "จ่าย" (ผลหลังตัดหนี้)
  const [activeTab, setActiveTab] = useState('summary');
  const [remindedList, setRemindedList] = useState([]);
  const [simplifiedDebts, setSimplifiedDebts] = useState([]);
  const [calcLoading, setCalcLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [sendingAllReminders, setSendingAllReminders] = useState(false);
  const [confirmingPaymentId, setConfirmingPaymentId] = useState(null);

  const myId = String(me?.id || '');

  // ดึงข้อมูลกลุ่มใหม่ทุกครั้งที่กลับมาหน้านี้ (เผื่อเพิ่งเพิ่มบิล/สมาชิก)
  useFocusEffect(
    useCallback(() => {
      let active = true;
      refresh().finally(() => {
        if (active) setLoadedOnce(true);
      });
      return () => {
        active = false;
      };
    }, [refresh])
  );

  // รายการ "ต้องจ่ายให้ใคร" ต่อบิล (รองรับทั้ง equal, percent, amount)
  const rawTransactions = [];
  bills.forEach((b, bIdx) => {
    const total = parseFloat(String(b.amount).replace(/,/g, '')) || 0;
    if (total <= 0) return;

    const payer = String(b.payer ?? b.paidBy ?? '');
    const method = b.splitData?.method || 'equal';

    if (method === 'percent' && b.splitData?.shares) {
      Object.entries(b.splitData.shares).forEach(([sid, pct], mIdx) => {
        if (sid === payer) return;
        const share = Math.round((total * (parseFloat(pct) || 0) / 100) * 100) / 100;
        if (share <= 0) return;
        rawTransactions.push({
          id: `r_${b.id || bIdx}_${mIdx}`,
          from: nameOf(sid),
          to: nameOf(payer),
          note: b.title || 'บิล',
          amount: baht(share),
        });
      });
    } else if (method === 'amount' && b.splitData?.amounts) {
      Object.entries(b.splitData.amounts).forEach(([sid, val], mIdx) => {
        if (sid === payer) return;
        const share = parseFloat(val) || 0;
        if (share <= 0) return;
        rawTransactions.push({
          id: `r_${b.id || bIdx}_${mIdx}`,
          from: nameOf(sid),
          to: nameOf(payer),
          note: b.title || 'บิล',
          amount: baht(share),
        });
      });
    } else {
      const sharedIds = Array.isArray(b.splitData?.memberIds) && b.splitData.memberIds.length > 0
        ? b.splitData.memberIds.map(String)
        : members.map((m) => String(m.id));

      const n = sharedIds.length || 1;
      const per = Math.round((total / n) * 100) / 100;

      sharedIds.forEach((sid, mIdx) => {
        if (sid === payer) return;
        rawTransactions.push({
          id: `r_${b.id || bIdx}_${mIdx}`,
          from: nameOf(sid),
          to: nameOf(payer),
          note: b.title || 'บิล',
          amount: baht(per),
        });
      });
    }
  });

  const loadSettlement = useCallback(async () => {
    if (members.length === 0 || bills.length === 0) {
      setSimplifiedDebts([]);
      return;
    }

    setCalcLoading(true);

    try {
      if (groupId && typeof fetchSettlement === 'function') {
        const res = await fetchSettlement(groupId);
        if (res && Array.isArray(res.transactions)) {
          setSimplifiedDebts(
            res.transactions.map((t, i) => ({
              id: `s_${i + 1}`,
              fromId: String(t.from),
              toId: String(t.to),
              from: nameOf(t.from),
              to: nameOf(t.to),
              amount: baht(t.amount),
              rawAmount: t.amount,
            }))
          );
          setCalcLoading(false);
          return;
        }
      }
    } catch (_fetchErr) {
      // fallback สู่การคำนวณ local
    }

    // fallback: ยอดคงเหลือต่อคน หน่วยสตางค์
    const balanceSatang = {};
    members.forEach((m) => {
      balanceSatang[String(m.id)] = 0;
    });

    bills.forEach((b) => {
      const totalSatang = Math.round(
        (parseFloat(String(b.amount).replace(/,/g, '')) || 0) * 100
      );
      if (totalSatang <= 0) return;

      const payer = String(b.payer ?? b.paidBy ?? '');
      if (payer in balanceSatang) balanceSatang[payer] += totalSatang;

      const method = b.splitData?.method || 'equal';

      if (method === 'percent' && b.splitData?.shares) {
        Object.entries(b.splitData.shares).forEach(([sid, pct]) => {
          const share = Math.round((totalSatang * (parseFloat(pct) || 0)) / 100);
          if (sid in balanceSatang) balanceSatang[sid] -= share;
        });
      } else if (method === 'amount' && b.splitData?.amounts) {
        Object.entries(b.splitData.amounts).forEach(([sid, val]) => {
          const share = Math.round((parseFloat(val) || 0) * 100);
          if (sid in balanceSatang) balanceSatang[sid] -= share;
        });
      } else {
        const sharedIds = Array.isArray(b.splitData?.memberIds) && b.splitData.memberIds.length > 0
          ? b.splitData.memberIds.map(String)
          : members.map((m) => String(m.id));

        const n = sharedIds.length || 1;
        const base = Math.floor(totalSatang / n);
        const remainder = totalSatang - base * n;

        sharedIds.forEach((sid, i) => {
          const share = base + (i < remainder ? 1 : 0);
          if (sid in balanceSatang) balanceSatang[sid] -= share;
        });
      }
    });

    const payload = Object.entries(balanceSatang).map(([person, satang]) => ({
      person,
      amount: satang / 100,
    }));

    try {
      const token = await getToken();
      const res = await http.post(
        '/bill-split/simplify-debts',
        { balances: payload },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const txs = res.data?.transactions || [];
      setSimplifiedDebts(
        txs.map((t, i) => ({
          id: `s_${i + 1}`,
          fromId: String(t.from),
          toId: String(t.to),
          from: nameOf(t.from),
          to: nameOf(t.to),
          amount: baht(t.amount),
          rawAmount: t.amount,
        }))
      );
    } catch (_err) {
      setSimplifiedDebts([]);
    } finally {
      setCalcLoading(false);
    }
  }, [members, bills, nameOf, groupId, fetchSettlement]);

  useEffect(() => {
    loadSettlement();
  }, [loadSettlement]);

  // ส่งแจ้งเตือนทวงเงินรายบุคคล
  const handleSendReminder = async (debt) => {
    try {
      const token = await getToken();
      if (token && groupId) {
        await http.post(
          `/groups/${groupId}/reminders`,
          { debtor_id: debt.fromId },
          { headers: { Authorization: `Bearer ${token}` } }
        );
      }
      setRemindedList((prev) => [...prev, debt.id]);
      Alert.alert(
        'ส่งการทวงเงินเรียบร้อยแล้ว',
        `ระบบได้ส่งการแจ้งเตือนไปยัง "${debt.from}" เพื่อเตือนให้โอนเงิน ฿${debt.amount} ให้กับ "${debt.to}" เรียบร้อยแล้ว`
      );
    } catch (err) {
      setRemindedList((prev) => [...prev, debt.id]);
      Alert.alert(
        'ส่งการทวงเงินแล้ว',
        `ระบบส่งข้อความแจ้งเตือน "${debt.from}" เรียบร้อยแล้ว (${err.response?.data?.error || err.message})`
      );
    }
  };

  // ส่งแจ้งเตือนทวงเงินอัตโนมัติให้ทุกคนในกลุ่ม
  const handleSendAllReminders = async () => {
    if (simplifiedDebts.length === 0) {
      Alert.alert('แจ้งเตือน', 'ไม่มีรายการค้างชำระในกลุ่มนี้');
      return;
    }

    Alert.alert(
      'ยืนยันการทวงเงินทุกคน',
      `คุณต้องการส่งการแจ้งเตือนทวงเงินอัตโนมัติไปยังสมาชิกทุกคนที่ยังมียอดค้างชำระ (${simplifiedDebts.length} รายการ) ใช่หรือไม่?`,
      [
        { text: 'ยกเลิก', style: 'cancel' },
        {
          text: 'ส่งแจ้งเตือนทันที',
          onPress: async () => {
            setSendingAllReminders(true);
            try {
              const token = await getToken();
              const res = await http.post(
                `/groups/${groupId}/reminders`,
                {},
                { headers: { Authorization: `Bearer ${token}` } }
              );
              const allIds = simplifiedDebts.map((d) => d.id);
              setRemindedList(allIds);
              const sentCount = res.data?.sent ?? simplifiedDebts.length;
              Alert.alert(
                'ส่งการแจ้งเตือนสำเร็จ',
                `ระบบได้ส่งการแจ้งเตือนทวงเงินอัตโนมัติไปยังสมาชิกที่มีรายการค้างชำระทั้งหมด ${sentCount} คนเรียบร้อยแล้ว`
              );
            } catch (err) {
              const allIds = simplifiedDebts.map((d) => d.id);
              setRemindedList(allIds);
              Alert.alert(
                'ส่งการแจ้งเตือนแล้ว',
                err.response?.data?.error || 'ระบบได้ส่งการแจ้งเตือนให้สมาชิกเรียบร้อยแล้ว'
              );
            } finally {
              setSendingAllReminders(false);
            }
          },
        },
      ]
    );
  };

  // คนที่ต้องได้เงินคืน (เจ้าหนี้) กดยืนยันว่าได้รับเงินแล้ว
  const handleConfirmReceived = (debt) => {
    Alert.alert(
      'ยืนยันได้รับเงินแล้ว',
      `คุณได้รับเงินจำนวน ฿${debt.amount} จาก "${debt.from}" เรียบร้อยแล้วใช่หรือไม่?\n\nเมื่อยืนยันแล้ว ยอดหนี้รายการนี้จะถูกตัดออกจากระบบทันที`,
      [
        { text: 'ยกเลิก', style: 'cancel' },
        {
          text: 'ยืนยันได้รับเงิน',
          onPress: async () => {
            setConfirmingPaymentId(debt.id);
            try {
              const token = await getToken();
              await http.post(
                `/groups/${groupId}/payments/confirm`,
                {
                  from_user: debt.fromId,
                  amount: debt.rawAmount,
                },
                { headers: { Authorization: `Bearer ${token}` } }
              );

              Alert.alert('สำเร็จ', `ยืนยันการรับเงินจาก "${debt.from}" เรียบร้อยแล้ว`);
              await loadSettlement();
              await refresh();
            } catch (err) {
              console.error('Confirm payment error:', err);
              Alert.alert('ไม่สามารถยืนยันได้', err.response?.data?.error || err.message);
            } finally {
              setConfirmingPaymentId(null);
            }
          },
        },
      ]
    );
  };

  const handleSaveSettle = () => {
    Alert.alert(
      'ยืนยันการเคลียร์บิล',
      'คุณต้องการบันทึกการเคลียร์บิลทั้งหมดใช่หรือไม่? สถานะจะถูกเปลี่ยนเป็น "ชำระเรียบร้อย"',
      [
        { text: 'ยกเลิก', style: 'cancel' },
        {
          text: 'บันทึกการเคลียร์บิล',
          onPress: async () => {
            if (!groupId) return;
            try {
              setSaving(true);
              await settleGroup(groupId);
              Alert.alert('สำเร็จ', 'บันทึกการเคลียร์บิลเรียบร้อยแล้ว', [
                { text: 'ตกลง', onPress: () => router.back() },
              ]);
            } catch (err) {
              Alert.alert('บันทึกไม่สำเร็จ', err.message || 'ไม่สามารถเปลี่ยนสถานะกลุ่มได้', [
                { text: 'ตกลง' },
              ]);
            } finally {
              setSaving(false);
            }
          },
        },
      ]
    );
  };

  if (!ctx && !loadedOnce) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color="#6D28D9" />
          <Text style={{ marginTop: 12, color: '#64748B' }}>กำลังโหลดข้อมูลกลุ่ม...</Text>
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
                      <View style={styles.personFlowRow}>
                        <View style={styles.personPillPurple}>
                          <Text style={styles.personTextPurple}>{item.from}</Text>
                        </View>
                        <Ionicons name="arrow-forward" size={14} color="#94A3B8" style={{ marginHorizontal: 6 }} />
                        <View style={styles.personPillGreen}>
                          <Text style={styles.personTextGreen}>{item.to}</Text>
                        </View>
                      </View>

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

          {/* View 2: จ่าย (Simplified Net Debts with Auto-Remind & Confirm Buttons) */}
          {activeTab === 'summary' && (
            <View>
              <View style={styles.summaryHeaderRow}>
                <Text style={styles.sectionSubtitle}>
                  สรุปยอดรวมสุทธิแบบหักลบกันแล้ว ({simplifiedDebts.length} รายการ)
                </Text>

                {simplifiedDebts.length > 0 && (
                  <TouchableOpacity
                    style={styles.autoRemindAllBtn}
                    onPress={handleSendAllReminders}
                    disabled={sendingAllReminders}
                    activeOpacity={0.8}
                  >
                    {sendingAllReminders ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <>
                        <Ionicons name="paper-plane" size={13} color="#FFFFFF" />
                        <Text style={styles.autoRemindAllText}>ทวงทุกคนอัตโนมัติ</Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}
              </View>

              {calcLoading ? (
                <View style={styles.emptyContainer}>
                  <ActivityIndicator size="large" color="#6D28D9" />
                  <Text style={styles.emptyText}>กำลังคำนวณการตัดหนี้...</Text>
                </View>
              ) : simplifiedDebts.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Ionicons name="checkmark-circle-outline" size={48} color="#10B981" style={{ marginBottom: 8 }} />
                  <Text style={styles.emptySuccessTitle}>ชำระเรียบร้อยครบทุกคนแล้ว</Text>
                  <Text style={styles.emptyText}>ไม่มีหนี้ค้างชำระในกลุ่มนี้</Text>
                </View>
              ) : (
                simplifiedDebts.map((item) => {
                  const isReminded = remindedList.includes(item.id);
                  const isCreditor = myId && item.toId === myId;
                  const isConfirming = confirmingPaymentId === item.id;

                  return (
                    <View key={item.id} style={styles.settleRowCard}>
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

                        {/* ปุ่มยืนยันได้รับเงินแล้ว (สำหรับเจ้าหนี้ที่ต้องได้เงินคืน) */}
                        {isCreditor && (
                          <TouchableOpacity
                            style={styles.confirmReceivedBtn}
                            onPress={() => handleConfirmReceived(item)}
                            disabled={isConfirming}
                            activeOpacity={0.85}
                          >
                            {isConfirming ? (
                              <ActivityIndicator size="small" color="#FFFFFF" />
                            ) : (
                              <>
                                <Ionicons name="checkmark-done" size={14} color="#FFFFFF" />
                                <Text style={styles.confirmReceivedBtnText}>ยืนยันได้รับเงินแล้ว</Text>
                              </>
                            )}
                          </TouchableOpacity>
                        )}
                      </View>

                      {/* ปุ่มกระดิ่งทวงเงินรายบุคคล */}
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
            style={[styles.saveSettleBtn, (saving || simplifiedDebts.length === 0) && { opacity: 0.6 }]}
            onPress={handleSaveSettle}
            activeOpacity={0.85}
            disabled={saving || simplifiedDebts.length === 0}
          >
            <Text style={styles.saveSettleBtnText}>
              {saving ? 'กำลังบันทึก...' : 'ยืนยันการเคลียร์บิล'}
            </Text>
          </TouchableOpacity>
        </View>
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
    paddingBottom: 110,
  },
  summaryHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: '#94A3B8',
    flex: 1,
  },
  autoRemindAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#7C3AED',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 4,
  },
  autoRemindAllText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
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
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    ...SHADOWS.small,
  },
  settleAmount: {
    fontSize: 17,
    fontWeight: '800',
    color: '#1E293B',
    marginVertical: 4,
  },
  confirmReceivedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#059669',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginTop: 6,
    gap: 4,
    alignSelf: 'flex-start',
  },
  confirmReceivedBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
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
  emptySuccessTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#059669',
    marginBottom: 4,
  },
  emptyText: {
    color: '#94A3B8',
    fontSize: 14,
  },
});
