import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, Platform, Modal, TouchableWithoutFeedback
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { API_URL } from '@/lib/api';

const CATEGORIES = [
  { id: 'Food', label: 'อาหาร', icon: 'restaurant', lib: 'Ionicons', bg: '#fff3e0', color: '#e65100' },
  { id: 'Transport', label: 'เดินทาง', icon: 'bus', lib: 'Ionicons', bg: '#e3f2fd', color: '#1565c0' },
  { id: 'Shopping', label: 'ช้อปปิ้ง', icon: 'bag-handle', lib: 'Ionicons', bg: '#fce4ec', color: '#c62828' },
  { id: 'Study', label: 'การศึกษา', icon: 'book', lib: 'Ionicons', bg: '#e8f5e9', color: '#2e7d32' },
  { id: 'Entertainment', label: 'บันเทิง', icon: 'game-controller', lib: 'Ionicons', bg: '#f3e5f5', color: '#7b1fa2' },
  { id: 'Health', label: 'สุขภาพ', icon: 'medkit', lib: 'Ionicons', bg: '#e0f7fa', color: '#00838f' },
  { id: 'Bills', label: 'บิล', icon: 'receipt', lib: 'Ionicons', bg: '#fff8e1', color: '#f57f17' },
  { id: 'Other', label: 'อื่นๆ', icon: 'ellipsis-horizontal', lib: 'Ionicons', bg: '#f5f5f5', color: '#616161' },
];

export default function AddTransactionScreen() {
  const router = useRouter();
  
  // Dynamic Payment Options State
  const [paymentMethods, setPaymentMethods] = useState([
    { id: 'Debit Card', label: 'Debit Card' },
    { id: 'Credit Card', label: 'Credit Card' },
    { id: 'Cash', label: 'Cash' },
    { id: 'PromptPay', label: 'PromptPay' },
  ]);

  // Form States
  const [type, setType] = useState('expense');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('Food');
  const [merchant, setMerchant] = useState('');
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [payment, setPayment] = useState('Debit Card');
  const [note, setNote] = useState('');

  // Modal States
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showAddPaymentInput, setShowAddPaymentInput] = useState(false);
  const [newPaymentName, setNewPaymentName] = useState('');

  // ฟังก์ชันเพิ่มช่องทางการชำระเงินใหม่
  const handleAddNewPayment = () => {
    if (!newPaymentName.trim()) {
      Alert.alert('ข้อผิดพลาด', 'กรุณากรอกชื่อช่องทางการชำระเงิน');
      return;
    }
    const name = newPaymentName.trim();
    const isExist = paymentMethods.some(p => p.label.toLowerCase() === name.toLowerCase());
    
    if (isExist) {
      Alert.alert('แจ้งเตือน', 'มีช่องทางการชำระเงินนี้อยู่แล้ว');
      return;
    }

    const newOption = { id: name, label: name };
    setPaymentMethods([...paymentMethods, newOption]);
    setPayment(name);
    setNewPaymentName('');
    setShowAddPaymentInput(false);
    setShowPaymentModal(false);
  };

  const handleSave = async () => {
    try {
      const numericAmount = parseFloat(amount);
      if (!amount || isNaN(numericAmount) || numericAmount <= 0) {
        Alert.alert('ข้อผิดพลาด', 'กรุณากรอกจำนวนเงินให้ถูกต้อง');
        return;
      }

      const token = await AsyncStorage.getItem('token');
      if (!token) {
        Alert.alert('กรุณาล็อกอิน', 'ไม่พบข้อมูลการเข้าสู่ระบบ', [
          { text: 'OK', onPress: () => router.replace('/login') }
        ]);
        return;
      }

      const response = await fetch(`${API_URL}/api/v1/personal/transactions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: merchant.trim() || category,
          amount: numericAmount,
          type: type,
          category: category,
          merchant: merchant.trim() || 'General',
          transaction_date: date.toISOString(),
          paymentMethod: payment,
          note: note.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 401) {
          await AsyncStorage.removeItem('token');
          Alert.alert('เซสชั่นหมดอายุ', 'กรุณาเข้าสู่ระบบใหม่', [
            { text: 'OK', onPress: () => router.replace('/login') }
          ]);
          return;
        }
        throw new Error(data.error || 'บันทึกไม่สำเร็จ');
      }

      Alert.alert('สำเร็จ', 'บันทึกรายการเรียบร้อย');
      router.back();
    } catch (err) {
      Alert.alert('Error', err.message);
    }
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header Bar */}
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>บันทึกรายการ</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Expense / Income Toggle */}
      <View style={styles.toggleContainer}>
        <TouchableOpacity
          style={[styles.toggleBtn, type === 'expense' && styles.toggleActive]}
          onPress={() => setType('expense')}
        >
          <Text style={[styles.toggleText, type === 'expense' && styles.toggleTextActive]}>
            รายจ่าย
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleBtn, type === 'income' && styles.toggleActive]}
          onPress={() => setType('income')}
        >
          <Text style={[styles.toggleText, type === 'income' && styles.toggleTextActive]}>
            รายรับ
          </Text>
        </TouchableOpacity>
      </View>

      {/* Amount Display & Input */}
      <View style={styles.amountSection}>
        <Text style={styles.labelTitleCenter}>จำนวนเงิน</Text>
        <View style={styles.amountInputRow}>
          <Text style={styles.currencySymbol}>฿</Text>
          <TextInput
            style={styles.amountInput}
            placeholder="0.00"
            placeholderTextColor="#a0a0e0"
            keyboardType="numeric"
            value={amount}
            onChangeText={setAmount}
          />
        </View>
      </View>

      {/* Category Picker */}
      <Text style={styles.labelTitle}>หมวดหมู่</Text>
      <View style={styles.categoryContainer}>
        {CATEGORIES.map((cat) => {
          const isSelected = category === cat.id;
          return (
            <TouchableOpacity
              key={cat.id}
              style={styles.catItem}
              onPress={() => setCategory(cat.id)}
            >
              <View style={[styles.catIconCircle, { backgroundColor: cat.bg }, isSelected && styles.catIconSelected]}>
                <Ionicons name={cat.icon} size={20} color={isSelected ? '#fff' : cat.color} />
              </View>
              <Text style={[styles.catLabel, isSelected && styles.catLabelSelected]}>
                {cat.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Scan AI OCR Button */}
      <TouchableOpacity style={styles.scanAiBtn} onPress={() => router.push('/scan-receipt')}>
        <MaterialCommunityIcons name="barcode-scan" size={20} color="#6c5ce7" />
        <Text style={styles.scanAiText}>Scan Receipt with AI OCR</Text>
      </TouchableOpacity>

      {/* Merchant Input */}
      <Text style={styles.labelTitle}>ร้านค้า/รายละเอียด</Text>
      <View style={styles.inputBox}>
        <StoreIcon />
        <TextInput
          style={styles.inputText}
          placeholder="e.g. Campus Cafe"
          placeholderTextColor="#aaa"
          value={merchant}
          onChangeText={setMerchant}
        />
      </View>

      {/* Date & Payment Row */}
      <View style={styles.rowTwoCol}>
        <View style={{ flex: 1, marginRight: 8 }}>
          <Text style={styles.labelTitle}>วันที่</Text>
          <TouchableOpacity style={styles.inputBox} onPress={() => setShowDatePicker(true)}>
            <Ionicons name="calendar-outline" size={18} color="#666" />
            <Text style={styles.inputText}>{date.toLocaleDateString()}</Text>
          </TouchableOpacity>
        </View>

        <View style={{ flex: 1, marginLeft: 8 }}>
          <Text style={styles.labelTitle}>ช่องทางชำระ</Text>
          <TouchableOpacity style={styles.inputBox} onPress={() => setShowPaymentModal(true)}>
            <Ionicons name="card-outline" size={18} color="#666" />
            <Text style={[styles.inputText, { flex: 1 }]} numberOfLines={1}>{payment}</Text>
            <Ionicons name="chevron-down" size={16} color="#888" />
          </TouchableOpacity>
        </View>
      </View>

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

      {/* Note Input */}
      <Text style={styles.labelTitle}>โน้ต (ไม่บังคับ)</Text>
      <View style={[styles.inputBox, styles.noteBox]}>
        <MaterialCommunityIcons name="square-edit-outline" size={18} color="#666" style={{ marginTop: 2 }} />
        <TextInput
          style={[styles.inputText, { textAlignVertical: 'top' }]}
          placeholder="Add a note..."
          placeholderTextColor="#aaa"
          multiline
          numberOfLines={3}
          value={note}
          onChangeText={setNote}
        />
      </View>

      {/* Save Button */}
      <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
        <Text style={styles.saveBtnText}>{type === 'expense' ? 'บันทึกรายจ่าย' : 'บันทึกรายรับ'}</Text>
      </TouchableOpacity>

      <View style={{ height: 40 }} />

      {/* Modal เลือกรวมถึงเพิ่ม Payment Method */}
      <Modal
        visible={showPaymentModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => {
          setShowPaymentModal(false);
          setShowAddPaymentInput(false);
        }}
      >
        <TouchableWithoutFeedback onPress={() => {
          setShowPaymentModal(false);
          setShowAddPaymentInput(false);
        }}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>Select Payment Method</Text>

                <ScrollView style={{ maxHeight: 220 }}>
                  {paymentMethods.map((item) => (
                    <TouchableOpacity
                      key={item.id}
                      style={[
                        styles.paymentOption,
                        payment === item.label && styles.paymentOptionSelected
                      ]}
                      onPress={() => {
                        setPayment(item.label);
                        setShowPaymentModal(false);
                        setShowAddPaymentInput(false);
                      }}
                    >
                      <Ionicons 
                        name="card-outline" 
                        size={18} 
                        color={payment === item.label ? '#5f3dc4' : '#666'} 
                        style={{ marginRight: 10 }} 
                      />
                      <Text style={[
                        styles.paymentOptionText,
                        payment === item.label && styles.paymentOptionTextSelected
                      ]}>
                        {item.label}
                      </Text>
                      {payment === item.label && <Ionicons name="checkmark" size={18} color="#5f3dc4" />}
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                {/* ส่วนเพิ่มการชำระเงินใหม่ */}
                {showAddPaymentInput ? (
                  <View style={styles.addPaymentRow}>
                    <TextInput
                      style={styles.newPaymentInput}
                      placeholder="e.g. KBank, SCB, TrueMoney"
                      placeholderTextColor="#aaa"
                      value={newPaymentName}
                      onChangeText={setNewPaymentName}
                      autoFocus
                    />
                    <TouchableOpacity style={styles.confirmAddBtn} onPress={handleAddNewPayment}>
                      <Text style={{ color: '#fff', fontWeight: '700' }}>Add</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity 
                    style={styles.addPaymentBtn}
                    onPress={() => setShowAddPaymentInput(true)}
                  >
                    <Ionicons name="add-circle-outline" size={20} color="#5f3dc4" />
                    <Text style={styles.addPaymentBtnText}>Add Custom Payment Method</Text>
                  </TouchableOpacity>
                )}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </ScrollView>
  );
}

const StoreIcon = () => (
  <Ionicons name="storefront-outline" size={18} color="#666" style={{ marginRight: 8 }} />
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fcfbfe', paddingHorizontal: 20, paddingTop: 45 },
  headerBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#5f3dc4' },
  
  toggleContainer: {
    flexDirection: 'row',
    backgroundColor: '#ebe8fc',
    borderRadius: 25,
    padding: 4,
    marginBottom: 20,
  },
  toggleBtn: { flex: 1, paddingVertical: 10, borderRadius: 20, alignItems: 'center' },
  toggleActive: { backgroundColor: '#fff', elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4 },
  toggleText: { fontSize: 14, fontWeight: '600', color: '#777' },
  toggleTextActive: { color: '#5f3dc4', fontWeight: '700' },

  amountSection: { alignItems: 'center', marginVertical: 10 },
  labelTitleCenter: { fontSize: 12, color: '#888', fontWeight: '500', marginBottom: 4 },
  amountInputRow: { flexDirection: 'row', alignItems: 'center' },
  currencySymbol: { fontSize: 32, fontWeight: '700', color: '#5f3dc4', marginRight: 6 },
  amountInput: { fontSize: 36, fontWeight: '700', color: '#5f3dc4', minWidth: 100 },

  labelTitle: { fontSize: 13, fontWeight: '600', color: '#555', marginTop: 16, marginBottom: 8 },
  categoryContainer: { 
    flexDirection: 'row', 
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    marginHorizontal: -5
  },
  catItem: { 
    alignItems: 'center',
    width: '25%',
    paddingVertical: 8,
    paddingHorizontal: 5
  },
  catIconCircle: {
    width: 50, height: 50, borderRadius: 25,
    justifyContent: 'center', alignItems: 'center', marginBottom: 4
  },
  catIconSelected: { backgroundColor: '#5f3dc4' },
  catLabel: { fontSize: 12, color: '#777', fontWeight: '500', textAlign: 'center' },
  catLabelSelected: { color: '#5f3dc4', fontWeight: '700' },

  scanAiBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: '#6c5ce7', borderRadius: 25,
    paddingVertical: 12, marginTop: 20, backgroundColor: '#fff'
  },
  scanAiText: { color: '#6c5ce7', fontWeight: '600', marginLeft: 8 },

  inputBox: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#f3f0ff', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12
  },
  inputText: { fontSize: 14, color: '#333', marginLeft: 6, flex: 1 },
  rowTwoCol: { flexDirection: 'row', justifyContent: 'space-between' },
  noteBox: { alignItems: 'flex-start', minHeight: 80 },

  saveBtn: {
    backgroundColor: '#5f3dc4', borderRadius: 25,
    paddingVertical: 16, alignItems: 'center', marginTop: 25,
    elevation: 4, shadowColor: '#5f3dc4', shadowOpacity: 0.3, shadowRadius: 8
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#222',
    marginBottom: 16,
    textAlign: 'center',
  },
  paymentOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: '#f8f9fa',
  },
  paymentOptionSelected: {
    backgroundColor: '#f0ebfe',
    borderWidth: 1,
    borderColor: '#5f3dc4',
  },
  paymentOptionText: {
    fontSize: 14,
    color: '#444',
    flex: 1,
    fontWeight: '500',
  },
  paymentOptionTextSelected: {
    color: '#5f3dc4',
    fontWeight: '700',
  },
  addPaymentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#5f3dc4',
    borderRadius: 12,
    borderStyle: 'dashed',
  },
  addPaymentBtnText: {
    color: '#5f3dc4',
    fontWeight: '600',
    marginLeft: 6,
    fontSize: 14,
  },
  addPaymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  newPaymentInput: {
    flex: 1,
    backgroundColor: '#f3f0ff',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginRight: 8,
    color: '#333',
  },
  confirmAddBtn: {
    backgroundColor: '#5f3dc4',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
});
