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
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { SHADOWS } from '../theme';
import ResponsiveWrapper from '../components/ResponsiveWrapper';
import { useGroup } from './context/GroupContext';

const CATEGORIES = [
  { id: 'food', label: 'อาหาร', icon: 'restaurant-outline' },
  { id: 'transport', label: 'เดินทาง', icon: 'car-outline' },
  { id: 'stay', label: 'ที่พัก', icon: 'home-outline' },
  { id: 'entertain', label: 'บันเทิง', icon: 'game-controller-outline' },
  { id: 'other', label: 'อื่นๆ', icon: 'ellipsis-horizontal-outline' },
];

export default function AddGroupExpenseScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { addGroupBill } = useGroup();

  const groupId = route.params?.groupId || '1';
  const groupName = route.params?.groupName || 'ทริปหัวหิน 2026';

  const routeMembers = route.params?.members;
  const initialMembers = (routeMembers && routeMembers.length > 0)
    ? routeMembers.map((m) => ({ ...m, selected: true }))
    : [
        { id: '1', name: 'นนท์ (ฉัน)', color: '#EF4444', selected: true },
        { id: '2', name: 'พลอย', color: '#10B981', selected: true },
        { id: '3', name: 'เตีย', color: '#F59E0B', selected: true },
        { id: '4', name: 'มาร์ช', color: '#8B5CF6', selected: true },
      ];

  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('food');
  const [payer, setPayer] = useState(initialMembers[0]?.name || 'นนท์ (ฉัน)');
  const [showPayerModal, setShowPayerModal] = useState(false);
  const [members, setMembers] = useState(initialMembers);

  // Compute equal split per selected person
  const numAmount = parseFloat(amount.replace(/,/g, '')) || 0;
  const selectedCount = members.filter((m) => m.selected).length;
  const perPerson = selectedCount > 0 ? (numAmount / selectedCount).toFixed(2) : '0.00';

  const toggleMember = (id) => {
    setMembers((prev) =>
      prev.map((m) => (m.id === id ? { ...m, selected: !m.selected } : m))
    );
  };

  const selectAll = () => {
    setMembers((prev) => prev.map((m) => ({ ...m, selected: true })));
  };

  const handleSave = () => {
    if (!title.trim() || numAmount <= 0) {
      Alert.alert('ข้อมูลไม่ครบถ้วน', 'กรุณากรอกชื่อรายการและยอดเงิน');
      return;
    }

    addGroupBill(groupId, {
      title: title.trim(),
      amount: numAmount.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 }),
      category: selectedCategory,
      payer: payer,
    });

    Alert.alert('บันทึกสำเร็จ! 🎉', `บันทึกรายการ "${title}" ฿${amount} เข้ากลุ่มเรียบร้อยแล้ว`, [
      {
        text: 'ตกลง',
        onPress: () => {
          if (navigation.canGoBack()) {
            navigation.goBack();
          } else {
            navigation.navigate('GroupDetail', { groupId, groupName });
          }
        },
      }
    ]);
  };

  return (
    <ResponsiveWrapper>
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#1E293B" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>กรอกข้อมูลรายการ</Text>
          <TouchableOpacity 
            style={styles.moreButton}
            onPress={() => Alert.alert('ตัวเลือกเพิ่มเติม', 'แชร์ หรือ ดูประวัติบิล')}
          >
            <Ionicons name="ellipsis-horizontal" size={22} color="#1E293B" />
          </TouchableOpacity>
        </View>

        {/* Group Banner Info */}
        <View style={styles.groupBanner}>
          <Ionicons name="people" size={16} color="#6D28D9" />
          <Text style={styles.groupBannerText}>บันทึกค่าใช้จ่ายในกลุ่ม: {groupName}</Text>
        </View>

        <ScrollView 
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Card 1: รายละเอียดค่าใช้จ่าย */}
          <View style={styles.card}>
            <Text style={styles.cardHeaderTitle}>| รายละเอียดค่าใช้จ่าย</Text>

            <Text style={styles.inputLabel}>ชื่อรายการค่าใช้จ่าย</Text>
            <TextInput
              style={styles.textInput}
              placeholder="เช่น ค่าอาหาร, ค่าน้ำมัน"
              placeholderTextColor="#94A3B8"
              value={title}
              onChangeText={setTitle}
            />

            <Text style={[styles.inputLabel, { marginTop: 14 }]}>ยอดเงินทั้งหมด (บาท)</Text>
            <View style={styles.amountInputContainer}>
              <TextInput
                style={styles.amountInput}
                placeholder="0.00"
                placeholderTextColor="#94A3B8"
                value={amount}
                onChangeText={setAmount}
                keyboardType="numeric"
              />
            </View>

            <Text style={[styles.inputLabel, { marginTop: 14, marginBottom: 8 }]}>หมวดหมู่</Text>
            <View style={styles.categoryRow}>
              {CATEGORIES.map((cat) => {
                const isSelected = selectedCategory === cat.id;
                return (
                  <TouchableOpacity
                    key={cat.id}
                    style={[styles.catPill, isSelected && styles.catPillActive]}
                    onPress={() => setSelectedCategory(cat.id)}
                    activeOpacity={0.8}
                  >
                    <Ionicons 
                      name={cat.icon} 
                      size={14} 
                      color={isSelected ? '#6D28D9' : '#64748B'} 
                      style={{ marginRight: 4 }} 
                    />
                    <Text style={[styles.catPillText, isSelected && styles.catPillTextActive]}>
                      {cat.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Card 2: คนจ่ายเงินหลัก */}
          <View style={styles.card}>
            <Text style={styles.cardHeaderTitle}>| คนจ่ายเงินหลัก</Text>

            <TouchableOpacity 
              style={styles.payerSelector}
              onPress={() => setShowPayerModal(true)}
              activeOpacity={0.8}
            >
              <View style={styles.payerLeft}>
                <View style={styles.payerAvatar}>
                  <Text style={styles.payerAvatarText}>{payer[3] || 'พ'}</Text>
                </View>
                <Text style={styles.payerName}>{payer}</Text>
              </View>
              <Ionicons name="chevron-down" size={18} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          {/* Card 3: ผู้ร่วมหารบิล */}
          <View style={styles.card}>
            <View style={styles.splitHeaderRow}>
              <Text style={styles.cardHeaderTitle}>
                | ผู้ร่วมหารบิล <Text style={styles.splitCountBadge}>{selectedCount} คน</Text>
              </Text>
              <TouchableOpacity onPress={selectAll}>
                <Text style={styles.selectAllText}>เลือกทั้งหมด</Text>
              </TouchableOpacity>
            </View>

            {/* Split Equal Banner */}
            <View style={styles.splitBanner}>
              <Ionicons name="calculator" size={16} color="#059669" />
              <Text style={styles.splitBannerText}>
                หารเท่ากัน: คนละ {Number(perPerson).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
              </Text>
            </View>

            {/* Member Checkboxes */}
            {members.map((m) => (
              <TouchableOpacity
                key={m.id}
                style={styles.memberSplitRow}
                onPress={() => toggleMember(m.id)}
                activeOpacity={0.8}
              >
                <View style={styles.memberLeft}>
                  <View style={[styles.memberDot, { backgroundColor: m.color }]} />
                  <Text style={styles.memberSplitName}>{m.name}</Text>
                </View>

                <View style={styles.memberRight}>
                  {m.selected && (
                    <Text style={styles.perPersonAmount}>
                      {Number(perPerson).toLocaleString('th-TH', { minimumFractionDigits: 0 })}
                    </Text>
                  )}
                  <View style={[styles.checkbox, m.selected && styles.checkboxActive]}>
                    {m.selected && <Ionicons name="checkmark" size={16} color="#FFFFFF" />}
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>

          {/* Buttons: Scan Receipt & Save */}
          <View style={styles.btnRow}>
            <TouchableOpacity 
              style={styles.scanBtn}
              onPress={() => navigation.navigate('UploadSlip')}
              activeOpacity={0.85}
            >
              <Ionicons name="camera-outline" size={20} color="#6D28D9" />
              <Text style={styles.scanBtnText}>สแกนสลิป/ใบเสร็จ</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.submitBtn}
              onPress={handleSave}
              activeOpacity={0.85}
            >
              <Text style={styles.submitBtnText}>ยืนยันและบันทึก</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>

        {/* Payer Modal */}
        <Modal visible={showPayerModal} transparent animationType="fade">
          <TouchableOpacity 
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setShowPayerModal(false)}
          >
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>เลือกคนจ่ายเงินหลัก</Text>
              {members.map((m) => (
                <TouchableOpacity
                  key={m.id}
                  style={styles.modalOption}
                  onPress={() => {
                    setPayer(m.name);
                    setShowPayerModal(false);
                  }}
                >
                  <View style={[styles.memberDot, { backgroundColor: m.color }]} />
                  <Text style={styles.modalOptionText}>{m.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </TouchableOpacity>
        </Modal>
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
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  backButton: {
    padding: 6,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1E293B',
  },
  moreButton: {
    padding: 6,
  },
  groupBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F3FF',
    paddingHorizontal: 20,
    paddingVertical: 10,
    gap: 8,
  },
  groupBannerText: {
    fontSize: 13,
    color: '#6D28D9',
    fontWeight: '600',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    ...SHADOWS.small,
  },
  cardHeaderTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 13,
    color: '#64748B',
    marginBottom: 6,
  },
  textInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: '#1E293B',
  },
  amountInputContainer: {
    borderWidth: 1.5,
    borderColor: '#6D28D9',
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  amountInput: {
    fontSize: 26,
    fontWeight: '800',
    color: '#1E293B',
  },
  categoryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  catPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  catPillActive: {
    backgroundColor: '#F5F3FF',
    borderColor: '#6D28D9',
  },
  catPillText: {
    fontSize: 13,
    color: '#64748B',
  },
  catPillTextActive: {
    color: '#6D28D9',
    fontWeight: '700',
  },
  payerSelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  payerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  payerAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#10B981',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  payerAvatarText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  payerName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1E293B',
  },
  splitHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  splitCountBadge: {
    color: '#6D28D9',
    fontSize: 13,
  },
  selectAllText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6D28D9',
  },
  splitBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    marginBottom: 12,
    gap: 6,
  },
  splitBannerText: {
    fontSize: 13,
    color: '#059669',
    fontWeight: '600',
  },
  memberSplitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  memberLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  memberDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 10,
  },
  memberSplitName: {
    fontSize: 14,
    color: '#1E293B',
    fontWeight: '500',
  },
  memberRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  perPersonAmount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxActive: {
    backgroundColor: '#6D28D9',
    borderColor: '#6D28D9',
  },
  btnRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  scanBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#6D28D9',
    borderRadius: 14,
    paddingVertical: 14,
    gap: 6,
  },
  scanBtnText: {
    color: '#6D28D9',
    fontSize: 14,
    fontWeight: '700',
  },
  submitBtn: {
    flex: 1.2,
    backgroundColor: '#5B21B6',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.small,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    ...SHADOWS.medium,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 16,
    textAlign: 'center',
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalOptionText: {
    fontSize: 15,
    color: '#1E293B',
  },
});
