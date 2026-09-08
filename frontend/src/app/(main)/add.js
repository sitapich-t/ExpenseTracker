import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  Alert,
  ScrollView,
} from 'react-native';
import axios from 'axios';

// ⚠️ อย่าลืมเปลี่ยน IP เป็น IP เครื่องคอมของคุณ เช่น 'http://192.168.1.50:3000'
const API_BASE_URL = (global.__API_URL__ || 'http://192.168.1.45:3000') + '/api/expenses';

export default function HomeScreen() {
  const currentUserId = 2; // Mock User ID

  // Form State
  const [title, setTitle] = useState('');
  const [subtotal, setSubtotal] = useState('');
  const [vat, setVat] = useState('7');
  const [serviceCharge, setServiceCharge] = useState('10');
  
  // Debts List State
  const [debts, setDebts] = useState([]);

  useEffect(() => {
    fetchMyDebts();
  }, []);

  const fetchMyDebts = async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/my-debts/${currentUserId}`);
      setDebts(res.data);
    } catch (err) {
      console.log('Error fetching debts:', err.message);
    }
  };

  const handleCreateExpense = async () => {
    if (!title || !subtotal) {
      Alert.alert('แจ้งเตือน', 'กรุณากรอกชื่อรายการและจำนวนเงิน');
      return;
    }

    try {
      await axios.post(`${API_BASE_URL}/create`, {
        groupId: 1,
        payerId: 1,
        title: title,
        subtotal: parseFloat(subtotal),
        vatPercent: parseFloat(vat),
        serviceChargePercent: parseFloat(serviceCharge),
        debtorIds: [2, 3]
      });

      Alert.alert('สำเร็จ', 'สร้างรายการหารเงินเรียบร้อยแล้ว');
      setTitle('');
      setSubtotal('');
      fetchMyDebts();
    } catch (err) {
      Alert.alert('ข้อผิดพลาด', err.response?.data?.error || 'เกิดข้อผิดพลาด');
    }
  };

  const handlePay = async (splitId, amountOwed) => {
    const mockOcrAmount = amountOwed;

    try {
      const res = await axios.post(`${API_BASE_URL}/pay`, {
        splitId: splitId,
        slipUrl: 'https://supabase.co/storage/v1/object/public/slips/slip123.jpg',
        ocrAmount: mockOcrAmount
      });

      Alert.alert('ผลการตรวจสอบ OCR', res.data.message);
      fetchMyDebts();
    } catch (err) {
      Alert.alert('ข้อผิดพลาด', 'ไม่สามารถแจ้งชำระเงินได้');
    }
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.header}>💰 ระบบหารค่าใช้จ่ายกลุ่ม</Text>

      {/* Form สร้างบิล */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>➕ สร้างบิลใหม่ (คิด VAT / Service Charge)</Text>
        
        <TextInput
          style={styles.input}
          placeholder="ชื่อรายการ (เช่น มื้อเย็นชาบู)"
          value={title}
          onChangeText={setTitle}
        />
        <TextInput
          style={styles.input}
          placeholder="ยอดเงินก่อนภาษี (Subtotal)"
          keyboardType="numeric"
          value={subtotal}
          onChangeText={setSubtotal}
        />
        <View style={styles.row}>
          <TextInput
            style={[styles.input, styles.halfInput]}
            placeholder="Service Charge (%)"
            keyboardType="numeric"
            value={serviceCharge}
            onChangeText={setServiceCharge}
          />
          <TextInput
            style={[styles.input, styles.halfInput]}
            placeholder="VAT (%)"
            keyboardType="numeric"
            value={vat}
            onChangeText={setVat}
          />
        </View>

        <TouchableOpacity style={styles.button} onPress={handleCreateExpense}>
          <Text style={styles.buttonText}>คำนวณและสร้างบิลหารเงิน</Text>
        </TouchableOpacity>
      </View>

      {/* รายการยอดคงค้าง */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>📋 รายการที่คุณต้องจ่ายคืน</Text>
        {debts.length === 0 ? (
          <Text style={styles.emptyText}>ไม่มีรายการยอดคงค้าง</Text>
        ) : (
          debts.map((item) => (
            <View key={item.split_id} style={styles.debtItem}>
              <View>
                <Text style={styles.debtTitle}>{item.title}</Text>
                <Text style={styles.debtSub}>เจ้าหนี้: {item.payer_name}</Text>
                <Text style={styles.debtStatus}>สถานะ: {item.status}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.debtAmount}>฿{item.amount_owed}</Text>
                {item.status === 'PENDING' && (
                  <TouchableOpacity
                    style={styles.payButton}
                    onPress={() => handlePay(item.split_id, item.amount_owed)}
                  >
                    <Text style={styles.payButtonText}>แนบสลิป (OCR)</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f6f8', padding: 20, paddingTop: 60 },
  header: { fontSize: 24, fontWeight: 'bold', color: '#1a1a1a', marginBottom: 20, textAlign: 'center' },
  card: { backgroundColor: '#fff', padding: 15, borderRadius: 12, marginBottom: 20, elevation: 3 },
  cardTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 15, color: '#333' },
  input: { borderWidth: 1, borderColor: '#ddd', padding: 12, borderRadius: 8, marginBottom: 10, fontSize: 14 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  halfInput: { width: '48%' },
  button: { backgroundColor: '#2563eb', padding: 14, borderRadius: 8, alignItems: 'center', marginTop: 5 },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  emptyText: { textAlign: 'center', color: '#888', padding: 10 },
  debtItem: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#eee' },
  debtTitle: { fontSize: 15, fontWeight: 'bold' },
  debtSub: { fontSize: 12, color: '#666' },
  debtStatus: { fontSize: 12, color: '#eab308', fontWeight: 'bold', marginTop: 2 },
  debtAmount: { fontSize: 16, fontWeight: 'bold', color: '#dc2626' },
  payButton: { backgroundColor: '#10b981', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, marginTop: 5 },
  payButtonText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
});