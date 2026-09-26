import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  SafeAreaView,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { SHADOWS } from '../theme';
import ResponsiveWrapper from '../components/ResponsiveWrapper';

export default function GroupDetailScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const groupName = route.params?.groupName || 'ทริปหัวหิน 2026 🏖️';
  const [note, setNote] = useState('');

  // Mock members matching mockup
  const members = [
    { id: '1', name: 'นนท์ (ฉัน)', color: '#EF4444' },
    { id: '2', name: 'พลอย', color: '#10B981' },
    { id: '3', name: 'เตีย', color: '#F59E0B' },
    { id: '4', name: 'มาร์ช', color: '#8B5CF6' },
  ];

  // Group bills matching mockup
  const bills = [
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

  return (
    <ResponsiveWrapper>
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#1E293B" />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>{groupName}</Text>
          <TouchableOpacity 
            style={styles.bellButton}
            onPress={() => Alert.alert('การแจ้งเตือน', 'ไม่มีการแจ้งเตือนใหม่ในกลุ่มนี้')}
          >
            <Ionicons name="notifications-outline" size={20} color="#1E293B" />
          </TouchableOpacity>
        </View>

        <ScrollView 
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Purple Summary Card */}
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>ยอดสรุปในกลุ่มนี้</Text>
            <Text style={styles.summaryAmount}>3,100.00</Text>
            
            <View style={styles.summaryFooterRow}>
              <View style={styles.receiveStatusPill}>
                <View style={styles.greenDot} />
                <Text style={styles.receiveStatusText}>คุณจะได้รับเงินสุทธิ</Text>
              </View>
              <Text style={styles.groupTotalText}>ยอดรวมกลุ่ม 12,400.00</Text>
            </View>
          </View>

          {/* Settle Bill Banner CTA */}
          <TouchableOpacity 
            style={styles.settleCtaBtn}
            onPress={() => navigation.navigate('GroupSettle', { groupName, members, bills })}
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

          {/* Section 1: สมาชิกกลุ่ม (4 คน) */}
          <View style={styles.sectionRow}>
            <Text style={styles.sectionTitle}>สมาชิกกลุ่ม (4 คน)</Text>
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
            <Text style={styles.totalBillSub}>ยอดรวม 12,400.00</Text>
          </View>

          {/* Bill List */}
          {bills.map((bill) => (
            <View key={bill.id} style={styles.billCard}>
              <View style={styles.billIconBox}>
                <Ionicons name="cart-outline" size={20} color="#1E293B" />
              </View>

              <View style={styles.billInfoCol}>
                <Text style={styles.billTitle}>{bill.title}</Text>
                <Text style={styles.billSub}>ผู้จ่าย: {bill.payer} • {bill.splitText}</Text>
              </View>

              <Text style={styles.billAmount}>{bill.amount}</Text>
            </View>
          ))}

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
          onPress={() => navigation.navigate('AddGroupExpense', { groupName })}
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={28} color="#FFFFFF" />
        </TouchableOpacity>
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
