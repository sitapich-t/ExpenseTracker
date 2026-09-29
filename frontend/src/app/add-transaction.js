import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Modal,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { API_URL, getToken, clearToken, http } from '@/lib/api';
import { COLORS, SPACING, RADIUS, CATEGORIES_LIST, getCategoryInfo, THAI_MONTHS } from '@/lib/theme';

// หมวดหมู่ใน theme เป็น string แต่ตาราง categories (Supabase) ใช้ category_id เป็นตัวเลข 1-9
const CATEGORY_ID_MAP = {
  food: 1,
  shopping: 2,
  transport: 4,
  education: 5,
  entertainment: 6,
  health: 7,
  housing: 8,
  utilities: 8,
  salary: 9,
  freelance: 9,
  investment: 9,
  gift: 9,
  other: 9,
};

// แปลงกลับ: category_id -> id ของ theme ใช้ตอนโหลดข้อมูลเดิมมาแก้ไข
const CATEGORY_ID_TO_THEME = {
  1: 'food',
  2: 'shopping',
  4: 'transport',
  5: 'education',
  6: 'entertainment',
  7: 'health',
  8: 'housing',
  9: 'other',
};

// ส่งวันที่เป็น YYYY-MM-DD ตามเวลาท้องถิ่น
// (ห้ามใช้ toISOString() เพราะจะแปลงเป็น UTC แล้ววันที่เลื่อนย้อนไป 1 วัน)
const toLocalDateString = (d) => {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
};

// วันที่แบบไทย ถ้าเป็นวันนี้จะขึ้นว่า "วันนี้, ..." เหมือนดีไซน์เดิม
const formatThaiDate = (d, withTime) => {
  const isToday = d.toDateString() === new Date().toDateString();
  const datePart = isToday
    ? `วันนี้, ${d.getDate()} ${THAI_MONTHS[d.getMonth()]} ${d.getFullYear() + 543}`
    : `${d.getDate()} ${THAI_MONTHS[d.getMonth()]} ${d.getFullYear() + 543}`;
  const timePart = withTime
    ? ` (${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} น.)`
    : '';
  return datePart + timePart;
};

export default function AddTransactionScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { edit } = useLocalSearchParams();
  const editId = edit ? String(edit) : null;

  const [type, setType] = useState('expense'); // 'income' or 'expense'
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('food');
  const [merchant, setMerchant] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(new Date());
  const [payment, setPayment] = useState('Cash');
  const [paymentMethods, setPaymentMethods] = useState([
    { id: 'Debit Card', label: 'Debit Card' },
    { id: 'Credit Card', label: 'Credit Card' },
    { id: 'Cash', label: 'Cash' },
    { id: 'PromptPay', label: 'PromptPay' },
  ]);
  const [isPaymentModalVisible, setPaymentModalVisible] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showAddPaymentInput, setShowAddPaymentInput] = useState(false);
  const [newPaymentName, setNewPaymentName] = useState('');
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(Boolean(editId));

  const isIncome = type === 'income';
  const dateFormattedStr = formatThaiDate(date, true);

  // โหมดแก้ไข: โหลดข้อมูลเดิมมาลง form ก่อนบันทึก
  useEffect(() => {
    if (!editId) return;

    const loadTransaction = async () => {
      try {
        setInitializing(true);
        const token = await getToken();
        if (!token) return;
        const response = await http.get(`/personal/transactions/${editId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const tx = response.data.transaction;
        if (!tx) return;

        const themeId = CATEGORY_ID_TO_THEME[tx.category_id] || 'other';
        setType(tx.type === 'income' ? 'income' : 'expense');
        setAmount(tx.amount != null ? String(tx.amount) : '');
        setCategory(themeId);
        setMerchant(tx.merchant || tx.title || '');
        setDate(tx.transaction_date ? new Date(tx.transaction_date) : new Date());
        if (tx.note) setNote(tx.note);
        if (tx.payment_method) setPayment(tx.payment_method);
      } catch (err) {
        console.error('Error loading transaction:', err);
        Alert.alert('ข้อผิดพลาด', 'ไม่สามารถโหลดข้อมูลรายการนี้ได้');
      } finally {
        setInitializing(false);
      }
    };

    loadTransaction();
  }, [editId]);

  // ฟังก์ชันเพิ่มช่องทางการชำระเงินใหม่
  const handleAddNewPayment = () => {
    if (!newPaymentName.trim()) {
      Alert.alert('ข้อผิดพลาด', 'กรุณากรอกชื่อช่องทางการชำระเงิน');
      return;
    }
    const name = newPaymentName.trim();
    const isExist = paymentMethods.some((p) => p.label.toLowerCase() === name.toLowerCase());

    if (isExist) {
      Alert.alert('แจ้งเตือน', 'มีช่องทางการชำระเงินนี้อยู่แล้ว');
      return;
    }

    setPaymentMethods([...paymentMethods, { id: name, label: name }]);
    setPayment(name);
    setNewPaymentName('');
    setShowAddPaymentInput(false);
    setPaymentModalVisible(false);
  };

  // เลือก alert ที่ "รุนแรงที่สุด" มาโชว์ ถ้ามีหลาย budget ข้าม threshold พร้อมกัน
  const pickMostSevereAlert = (budgetAlerts) => {
    if (!budgetAlerts || budgetAlerts.length === 0) return null;
    return (
      budgetAlerts.find((a) => a.level === 'OVER') ||
      budgetAlerts.find((a) => a.level === 'WARNING') ||
      null
    );
  };

  const handleSave = async () => {
    const numAmount = parseFloat(amount.replace(/,/g, ''));
    if (!numAmount || isNaN(numAmount) || numAmount <= 0) {
      Alert.alert('ข้อผิดพลาด', 'กรุณาระบุจำนวนเงินที่ถูกต้อง');
      return;
    }

    setLoading(true);
    try {
      const token = await getToken();
      if (!token) {
        Alert.alert('กรุณาล็อกอิน', 'ไม่พบข้อมูลการเข้าสู่ระบบ', [
          { text: 'OK', onPress: () => router.replace('/login') },
        ]);
        return;
      }

      const catInfo = getCategoryInfo(category);
      const url = editId
        ? `${API_URL}/api/v1/personal/transactions/${editId}`
        : `${API_URL}/api/v1/personal/transactions`;

      const response = await fetch(url, {
        method: editId ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: merchant.trim() || catInfo.name,
          amount: numAmount,
          type,
          category_id: CATEGORY_ID_MAP[category] ?? 9,
          merchant: merchant.trim() || 'General',
          transaction_date: toLocalDateString(date),
          paymentMethod: payment,
          note: note.trim(),
        }),
      });

      const data = await response.json();
      console.log('=== BUDGET ALERTS ===', JSON.stringify(data.budgetAlerts));

      if (!response.ok) {
        if (response.status === 401) {
          await clearToken();
          Alert.alert('เซสชั่นหมดอายุ', 'กรุณาเข้าสู่ระบบใหม่', [
            { text: 'OK', onPress: () => router.replace('/login') },
          ]);
          return;
        }
        throw new Error(data.error || 'บันทึกไม่สำเร็จ');
      }

      // เช็คว่ารายการนี้ทำให้งบข้าม threshold (WARNING/OVER) หรือไม่
      const alert = pickMostSevereAlert(data.budgetAlerts);

      if (alert) {
        const percentText = `${(alert.percentUsed * 100).toFixed(0)}%`;
        const title = alert.level === 'OVER' ? '🔴 เกินงบประมาณแล้ว' : '⚠️ ใกล้เต็มงบแล้ว';
        const body =
          alert.level === 'OVER'
            ? `บันทึกรายการสำเร็จ แต่คุณใช้จ่ายไปแล้ว ${percentText} เกินงบที่ตั้งไว้`
            : `บันทึกรายการสำเร็จ ตอนนี้ใช้จ่ายไปแล้ว ${percentText} ของงบที่ตั้งไว้`;

        Alert.alert(title, body, [{ text: 'ตกลง', onPress: () => router.back() }]);
      } else {
        Alert.alert('สำเร็จ', editId ? 'อัปเดตรายการเรียบร้อย' : 'บันทึกรายการเรียบร้อย', [
          { text: 'ตกลง', onPress: () => router.back() },
        ]);
      }
    } catch (error) {
      console.log('Save expense error:', error);
      Alert.alert('ข้อผิดพลาด', error.message || 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาลองใหม่');
    } finally {
      setLoading(false);
    }
  };

  if (initializing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Top Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={24} color="#1F2937" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{editId ? 'แก้ไขรายการ' : 'เพิ่มรายการบัญชี'}</Text>
        <View style={styles.avatarCircle}>
          <Ionicons name="person" size={18} color={COLORS.primary} />
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
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
            {/* Category Circle Picker */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>
                {isIncome ? 'หมวดหมู่รายรับ' : 'หมวดหมู่รายจ่าย'}
              </Text>
              <View style={styles.catGrid}>
                {CATEGORIES_LIST.map((cat) => {
                  const isSelected = category === cat.id;
                  return (
                    <TouchableOpacity
                      key={cat.id}
                      style={styles.catCell}
                      onPress={() => setCategory(cat.id)}
                      activeOpacity={0.7}
                    >
                      <View
                        style={[
                          styles.catCircle,
                          { backgroundColor: `${cat.color}22` },
                          isSelected && { backgroundColor: cat.color },
                        ]}
                      >
                        <Text style={styles.catEmoji}>{cat.emoji}</Text>
                      </View>
                      <Text
                        style={[styles.catLabel, isSelected && styles.catLabelActive]}
                        numberOfLines={2}
                      >
                        {cat.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Date & Time */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>วันที่และเวลา</Text>
              <TouchableOpacity
                style={styles.inputCard}
                onPress={() => setShowDatePicker(true)}
                activeOpacity={0.8}
              >
                <Text style={styles.inputText}>{dateFormattedStr}</Text>
                <Ionicons name="calendar-outline" size={20} color="#6B7280" />
              </TouchableOpacity>
            </View>

            {/* Payment Method */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>ช่องทางการชำระเงิน</Text>
              <TouchableOpacity
                style={styles.inputCard}
                onPress={() => setPaymentModalVisible(true)}
                activeOpacity={0.8}
              >
                <Ionicons name="card-outline" size={20} color="#6B7280" />
                <Text style={[styles.inputText, { flex: 1, marginLeft: 8 }]} numberOfLines={1}>
                  {payment}
                </Text>
                <Ionicons name="chevron-down" size={20} color="#6B7280" />
              </TouchableOpacity>
            </View>

            {/* Scan AI OCR */}
            <TouchableOpacity
              style={styles.scanAiBtn}
              onPress={() => router.push('/scan-receipt')}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons name="barcode-scan" size={20} color={COLORS.primary} />
              <Text style={styles.scanAiText}>สแกนใบเสร็จด้วย AI OCR</Text>
            </TouchableOpacity>

            {/* Merchant */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>ร้านค้า/รายละเอียด</Text>
              <View style={styles.inputCard}>
                <Ionicons name="storefront-outline" size={18} color="#6B7280" />
                <TextInput
                  style={styles.textInputFull}
                  value={merchant}
                  onChangeText={setMerchant}
                  placeholder="e.g. Campus Cafe"
                  placeholderTextColor="#9CA3AF"
                />
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

      {/* Payment Method Modal */}
      <Modal
        visible={isPaymentModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => {
          setPaymentModalVisible(false);
          setShowAddPaymentInput(false);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>ช่องทางการชำระเงิน</Text>
              <TouchableOpacity
                onPress={() => {
                  setPaymentModalVisible(false);
                  setShowAddPaymentInput(false);
                }}
              >
                <Ionicons name="close" size={24} color="#1F2937" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 260 }}>
              {paymentMethods.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={styles.categoryItem}
                  onPress={() => {
                    setPayment(item.label);
                    setPaymentModalVisible(false);
                    setShowAddPaymentInput(false);
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name="card-outline"
                    size={20}
                    color={payment === item.label ? COLORS.primary : '#6B7280'}
                    style={{ marginRight: 14 }}
                  />
                  <Text style={styles.categoryName}>{item.label}</Text>
                  {payment === item.label && (
                    <Ionicons name="checkmark-circle" size={22} color={COLORS.primary} />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>

            {showAddPaymentInput ? (
              <View style={styles.addPaymentRow}>
                <TextInput
                  style={styles.addPaymentInput}
                  placeholder="เช่น KBank, SCB, TrueMoney"
                  placeholderTextColor="#9CA3AF"
                  value={newPaymentName}
                  onChangeText={setNewPaymentName}
                  autoFocus
                />
                <TouchableOpacity
                  style={styles.addPaymentConfirmBtn}
                  onPress={handleAddNewPayment}
                  activeOpacity={0.8}
                >
                  <Text style={styles.addPaymentConfirmText}>เพิ่ม</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.addPaymentBtn}
                onPress={() => setShowAddPaymentInput(true)}
                activeOpacity={0.8}
              >
                <Ionicons name="add-circle-outline" size={20} color={COLORS.primary} />
                <Text style={styles.addPaymentBtnText}>เพิ่มช่องทางการชำระเงิน</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

      {showDatePicker && (
        <DateTimePicker
          value={date}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(event, selectedDate) => {
            setShowDatePicker(false);
            if (selectedDate) setDate(selectedDate);
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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

  // ---- เพิ่มเติมสำหรับฟีเจอร์ที่คงไว้ (OCR / ช่องทางการชำระเงิน) ----
  catGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  catCell: {
    width: '25%',
    alignItems: 'center',
    paddingVertical: 8,
  },
  catCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  catEmoji: {
    fontSize: 24,
  },
  catLabel: {
    fontSize: 10,
    lineHeight: 13,
    color: '#6B7280',
    textAlign: 'center',
    fontWeight: '500',
    height: 26,
  },
  catLabelActive: {
    color: '#1F2937',
    fontWeight: '700',
  },
  scanAiBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E9D5FF',
    borderRadius: RADIUS.full,
    paddingVertical: 12,
    marginBottom: SPACING.lg,
  },
  scanAiText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primary,
    marginLeft: 8,
  },
  addPaymentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    margin: SPACING.md,
    marginHorizontal: SPACING.lg,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderStyle: 'dashed',
    borderRadius: RADIUS.md,
    paddingVertical: 12,
  },
  addPaymentBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primary,
    marginLeft: 6,
  },
  addPaymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
  },
  addPaymentInput: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    fontSize: 14,
    color: '#1F2937',
    marginRight: 8,
  },
  addPaymentConfirmBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingHorizontal: 18,
    paddingVertical: 11,
  },
  addPaymentConfirmText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
});
