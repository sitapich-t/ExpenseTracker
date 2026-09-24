import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Modal,
  FlatList,
  Alert,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { useAuth } from './context/AuthContext';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS, CATEGORIES_LIST, getCategoryInfo, THAI_MONTHS } from '../theme';

const API_BASE_URL = 'http://10.0.2.2:3000/api';

export default function AddExpenseScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { currentUser } = useAuth();
  
  const defaultType = route.params?.type || 'expense';
  
  const [type, setType] = useState(defaultType); // 'income' or 'expense'
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState(defaultType === 'income' ? 'salary' : 'food');
  const [note, setNote] = useState('');
  const [isCategoryModalVisible, setCategoryModalVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  
  const now = new Date();
  const dateFormattedStr = `วันนี้, ${now.getDate()} ${THAI_MONTHS[now.getMonth()]} ${now.getFullYear() + 543} (${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} น.)`;

  useEffect(() => {
    if (route.params?.type) {
      setType(route.params.type);
      setCategory(route.params.type === 'income' ? 'salary' : 'food');
    }
  }, [route.params?.type]);

  const handleSave = async () => {
    const numAmount = parseFloat(amount.replace(/,/g, ''));
    if (!numAmount || isNaN(numAmount) || numAmount <= 0) {
      Alert.alert('ข้อผิดพลาด', 'กรุณาระบุจำนวนเงินที่ถูกต้อง');
      return;
    }
    
    setLoading(true);
    try {
      const catInfo = getCategoryInfo(category);
      const payload = {
        userId: currentUser?.id || 'demo_user',
        title: note.trim() || catInfo.name,
        amount: numAmount,
        type,
        category: catInfo.name,
        note: note.trim(),
        date: now.toISOString().split('T')[0],
      };
      
      const res = await axios.post(`${API_BASE_URL}/expenses`, payload);
      if (res.data && res.data.success) {
        Alert.alert('สำเร็จ', 'บันทึกรายการเรียบร้อยแล้ว', [
          { text: 'ตกลง', onPress: () => navigation.goBack() }
        ]);
      } else {
        Alert.alert('ข้อผิดพลาด', res.data?.message || 'ไม่สามารถบันทึกรายการได้');
      }
    } catch (error) {
      console.log('Save expense error:', error);
      Alert.alert('ข้อผิดพลาด', 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาลองใหม่');
    } finally {
      setLoading(false);
    }
  };

  const isIncome = type === 'income';
  const selectedCat = getCategoryInfo(category);

  return (
    <SafeAreaView style={styles.container}>
      {/* Top Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton} 
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={24} color="#1F2937" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>เพิ่มรายการบัญชี</Text>
        <View style={styles.avatarCircle}>
          <Ionicons name="person" size={18} color={COLORS.primary} />
        </View>
      </View>

      <KeyboardAvoidingView 
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
          
          {/* Segmented Toggle Pills: รายรับ | รายจ่าย */}
          <View style={styles.toggleContainer}>
            <TouchableOpacity 
              style={[styles.toggleBtn, isIncome && styles.toggleBtnActive]}
              onPress={() => {
                setType('income');
                if (category === 'food') setCategory('salary');
              }}
              activeOpacity={0.8}
            >
              <Text style={[styles.toggleText, isIncome && styles.toggleTextActive]}>
                รายรับ
              </Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.toggleBtn, !isIncome && styles.toggleBtnActive]}
              onPress={() => {
                setType('expense');
                if (category === 'salary') setCategory('food');
              }}
              activeOpacity={0.8}
            >
              <Text style={[styles.toggleText, !isIncome && styles.toggleTextActive]}>
                รายจ่าย
              </Text>
            </TouchableOpacity>
          </View>

          {/* Amount Display Section matching media_1790137581718.png */}
          <View style={styles.amountBox}>
            <Text style={styles.amountLabel}>
              {isIncome ? 'จำนวนเงินที่รับเข้า' : 'จำนวนเงินที่ออกไป'}
            </Text>
            <View style={styles.amountRow}>
              <Text style={[styles.currencyPrefix, { color: isIncome ? '#16A34A' : '#EF4444' }]}>
                ฿
              </Text>
              <TextInput
                style={[styles.amountInput, { color: isIncome ? '#16A34A' : '#EF4444' }]}
                value={amount}
                onChangeText={setAmount}
                keyboardType="decimal-pad"
                placeholder={isIncome ? "1,500.00" : "1,000.00"}
                placeholderTextColor={isIncome ? 'rgba(22, 163, 74, 0.4)' : 'rgba(239, 68, 68, 0.4)'}
              />
            </View>
          </View>

          {/* Form Fields */}
          <View style={styles.formContainer}>
            {/* Category Dropdown */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>
                {isIncome ? 'หมวดหมู่รายรับ' : 'หมวดหมู่รายจ่าย'}
              </Text>
              <TouchableOpacity 
                style={styles.inputCard}
                onPress={() => setCategoryModalVisible(true)}
                activeOpacity={0.8}
              >
                <Text style={styles.inputText}>
                  {selectedCat.emoji} {selectedCat.name}
                </Text>
                <Ionicons name="chevron-down" size={20} color="#6B7280" />
              </TouchableOpacity>
            </View>

            {/* Date & Time */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>วันที่และเวลา</Text>
              <View style={styles.inputCard}>
                <Text style={styles.inputText}>
                  {dateFormattedStr}
                </Text>
                <Ionicons name="calendar-outline" size={20} color="#6B7280" />
              </View>
            </View>

            {/* Additional Note */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>โน้ตบันทึกเพิ่มเติม (ตัวเลือก)</Text>
              <View style={styles.inputCard}>
                <TextInput
                  style={styles.textInputFull}
                  value={note}
                  onChangeText={setNote}
                  placeholder={isIncome ? "ของขวัญวันปีใหม่ย้อนหลังจากญาติผู้ใหญ่" : "ค่าขนม ค่าเสื้อผ้า"}
                  placeholderTextColor="#9CA3AF"
                />
              </View>
            </View>
          </View>

          {/* Big Green Save Button matching mockup */}
          <View style={styles.saveBtnContainer}>
            <TouchableOpacity 
              style={[styles.saveButton, loading && { opacity: 0.7 }]}
              onPress={handleSave}
              disabled={loading}
              activeOpacity={0.85}
            >
              <Text style={styles.saveButtonText}>
                {loading ? 'กำลังบันทึก...' : 'บันทึก'}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Category Modal */}
      <Modal
        visible={isCategoryModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setCategoryModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>เลือกหมวดหมู่</Text>
              <TouchableOpacity onPress={() => setCategoryModalVisible(false)}>
                <Ionicons name="close" size={24} color="#1F2937" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={CATEGORIES_LIST}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.categoryItem}
                  onPress={() => {
                    setCategory(item.id);
                    setCategoryModalVisible(false);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.categoryEmoji}>{item.emoji}</Text>
                  <Text style={styles.categoryName}>{item.name}</Text>
                  {category === item.id && (
                    <Ionicons name="checkmark-circle" size={22} color={COLORS.primary} />
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
  },
  avatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#EDE9FE',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    flex: 1,
    paddingHorizontal: SPACING.lg,
  },
  toggleContainer: {
    flexDirection: 'row',
    backgroundColor: '#E5E7EB',
    borderRadius: RADIUS.lg,
    padding: 4,
    marginTop: SPACING.lg,
    marginBottom: SPACING.xl,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: RADIUS.md,
  },
  toggleBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  toggleText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#6B7280',
  },
  toggleTextActive: {
    color: '#1F2937',
    fontWeight: '700',
  },
  amountBox: {
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  amountLabel: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 6,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  currencyPrefix: {
    fontSize: 36,
    fontWeight: '800',
    marginRight: 6,
  },
  amountInput: {
    fontSize: 40,
    fontWeight: '800',
    minWidth: 160,
    textAlign: 'center',
    paddingVertical: 0,
  },
  formContainer: {
    marginBottom: SPACING.xl,
  },
  fieldGroup: {
    marginBottom: SPACING.lg,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
  },
  inputCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  inputText: {
    fontSize: 15,
    color: '#1F2937',
  },
  textInputFull: {
    flex: 1,
    fontSize: 15,
    color: '#1F2937',
    padding: 0,
  },
  saveBtnContainer: {
    marginTop: SPACING.sm,
  },
  saveButton: {
    backgroundColor: '#16A34A', // Vibrant green from media_1790137581718.png
    borderRadius: RADIUS.full,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: '#16A34A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  saveButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    maxHeight: '70%',
    paddingBottom: 30,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1F2937',
  },
  categoryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  categoryEmoji: {
    fontSize: 22,
    marginRight: 14,
  },
  categoryName: {
    flex: 1,
    fontSize: 15,
    color: '#1F2937',
    fontWeight: '500',
  },
});