import React, { useState } from 'react';
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

export default function GroupSettleScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const location = route.params?.groupName || 'Hua Hin';

  // 2 modes matching Figma mockup: "ทั้งหมด" (raw transactions) vs "จ่าย" (debt simplification)
  const [activeTab, setActiveTab] = useState('summary'); // 'all', 'summary'
  const [remindedList, setRemindedList] = useState([]);

  // Mock raw transactions ("ทั้งหมด")
  const rawTransactions = [
    {
      id: 'r1',
      from: 'แพร',
      to: 'บล็อก',
      note: 'จ่ายค่าอาหารกลางวันร้านมิชลิน',
      amount: '60',
    },
    {
      id: 'r2',
      from: 'วุฒิ',
      to: 'บล็อก',
      note: 'จ่ายค่าอาหารกลางวันร้านมิชลิน',
      amount: '60',
    },
    {
      id: 'r3',
      from: 'บล็อก',
      to: 'วุฒิ',
      note: 'จ่ายค่าน้ำมันรถเที่ยวเกาะ',
      amount: '150',
    },
    {
      id: 'r4',
      from: 'แพร',
      to: 'วุฒิ',
      note: 'จ่ายค่าน้ำมันรถเที่ยวเกาะ',
      amount: '150',
    },
  ];

  // Simplified net debts ("จ่าย" - Debt Simplification)
  const simplifiedDebts = [
    {
      id: 's1',
      from: 'แพร',
      to: 'วุฒิ',
      amount: '210',
    },
    {
      id: 's2',
      from: 'บล็อก',
      to: 'วุฒิ',
      amount: '30',
    },
  ];

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
          onPress: () => {
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
            <Text style={styles.metaBadgeText}>3 คน</Text>
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

              {rawTransactions.map((item) => (
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
              ))}
            </View>
          )}

          {/* View 2: จ่าย (Simplified Net Debts with Red Bell ทวงเงิน) */}
          {activeTab === 'summary' && (
            <View>
              <Text style={styles.sectionSubtitle}>
                สรุปยอดรวมสุทธิแบบหักลบกันแล้ว ({simplifiedDebts.length} รายการ)
              </Text>

              {simplifiedDebts.map((item) => {
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
              })}
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
});
