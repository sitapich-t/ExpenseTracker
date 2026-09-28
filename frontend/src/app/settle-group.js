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
  const { settleGroup, getGroup, refresh } = useGroup();

  const groupId = params.groupId;
  const location = params.groupName || getGroup(groupId)?.name || 'กลุ่มของฉัน';
  // expo-router ส่ง param เป็น string เสมอ -> array ที่ส่งมาจะกลายเป็น "a,b"
  // อ่านจาก context เป็นหลัก (แหล่งจริง) และกัน non-array ทุกกรณี
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

  // รายการ "ต้องจ่ายให้ใคร" ต่อบิล (คำนวณตรงนี้ เพราะเป็นการรวมข้อมูลของฉันเอง)
  const rawTransactions = [];
  bills.forEach((b, bIdx) => {
    const total = parseFloat(String(b.amount).replace(/,/g, '')) || 0;
    if (total <= 0) return;

    // ใครแชร์บิลนี้ (ถ้าไม่มีข้อมูล = ทุกคน)
    const sharedIds = Array.isArray(b.splitData?.memberIds) && b.splitData.memberIds.length > 0
      ? b.splitData.memberIds.map(String)
      : members.map((m) => String(m.id));

    const n = sharedIds.length || 1;
    const per = Math.round((total / n) * 100) / 100;
    const payer = String(b.payer ?? b.paidBy ?? '');

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
  });

  // การตัดหนี้ (debt simplification) ให้ backend คำนวณ เพราะเป็น business logic
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (members.length === 0 || bills.length === 0) {
        setSimplifiedDebts([]);
        return;
      }

      // ยอดคงเหลือต่อคน: จ่ายบิลได้ = บวก, ต้องจ่าย = ลบ
      const balance = {};
      members.forEach((m) => {
        balance[String(m.id)] = 0;
      });

      bills.forEach((b) => {
        const total = parseFloat(String(b.amount).replace(/,/g, '')) || 0;
        if (total <= 0) return;

        const sharedIds = Array.isArray(b.splitData?.memberIds) && b.splitData.memberIds.length > 0
          ? b.splitData.memberIds.map(String)
          : members.map((m) => String(m.id));

        const n = sharedIds.length || 1;
        const per = Math.round((total / n) * 100) / 100;
        const payer = String(b.payer ?? b.paidBy ?? '');

        if (payer in balance) balance[payer] += total;
        sharedIds.forEach((sid) => {
          if (sid in balance) balance[sid] -= per;
        });
      });

      const payload = Object.entries(balance).map(([person, amount]) => ({
        person,
        amount: Math.round(amount * 100) / 100,
      }));

      try {
        setCalcLoading(true);
        const token = await getToken();
        const res = await http.post(
          '/bill-split/simplify-debts',
          { balances: payload },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (cancelled) return;

        const txs = res.data?.transactions || [];
        setSimplifiedDebts(
          txs.map((t, i) => ({
            id: `s_${i + 1}`,
            from: nameOf(t.from),
            to: nameOf(t.to),
            amount: baht(t.amount),
          }))
        );
      } catch (err) {
        if (cancelled) return;
        // คำนวณไม่ได้ก็ยังดูรายบิลดิบได้
        setSimplifiedDebts([]);
      } finally {
        if (!cancelled) setCalcLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [members, bills, nameOf]);

  const handleSendReminder = (debt) => {
    setRemindedList((prev) => [...prev, debt.id]);
    Alert.alert(
      '🔔 ส่งการทวงเงินเรียบร้อยแล้ว!',
      `ระบบได้ส่งการแจ้งเตือน Push Notification & SMS ทวงเงินไปยัง "${debt.from}" เพื่อโอนเงิน ฿${debt.amount} ให้กับ "${debt.to}" เรียบร้อยแล้ว`
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
              Alert.alert('สำเร็จ! 🎉', 'บันทึกการเคลียร์บิลเรียบร้อยแล้ว', [
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

  // ถ้ายังไม่มีกลุ่มใน context (เพิ่งเข้ามา/เพิ่ง refresh) -> รอก่อน ไม่งั้นจะโชว์ "ไม่มีรายการ" ผิด ๆ
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

                {calcLoading ? (
                  <View style={styles.emptyContainer}>
                    <ActivityIndicator size="large" color="#6D28D9" />
                    <Text style={styles.emptyText}>กำลังคำนวณการตัดหนี้...</Text>
                  </View>
                ) : simplifiedDebts.length === 0 ? (
                  <View style={styles.emptyContainer}>
                    <Text style={styles.emptyText}>ทุกคนชำระเรียบร้อยแล้ว ไม่มีรายการที่ต้องจ่าย</Text>
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
