import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image,
  TextInput, ScrollView, Alert
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = global.__API_URL__ || 'http://192.168.1.45:3000';

export default function ConfirmReceiptScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const [merchant, setMerchant] = useState(params.merchant || 'Starbucks');
  const [amount, setAmount] = useState(params.amount || '5.50');
  const [date, setDate] = useState(params.date || '10/24/2023');
  const [category, setCategory] = useState(params.category || 'Food & Drink');
  const [paymentMethod, setPaymentMethod] = useState('Card'); // 'Card' | 'Cash'

  const handleConfirmSave = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/v1/personal/transactions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: merchant,
          amount: parseFloat(amount),
          type: 'expense',
          category: category,
          merchant: merchant,
          transaction_date: new Date().toISOString(),
          paymentMethod: paymentMethod,
        }),
      });

      if (!response.ok) throw new Error('Failed to save');
      
      Alert.alert('สำเร็จ', 'บันทึกใบเสร็จเรียบร้อยแล้ว');
      router.replace('/dashboard');
    } catch (err) {
      Alert.alert('Error', err.message);
    }
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="close" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Confirm Details</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Image Preview Box */}
      <View style={styles.imagePreviewBox}>
        <Image
          source={{ uri: params.imageUri || 'https://via.placeholder.com/300' }}
          style={styles.previewImage}
          blurRadius={ Platform.OS === 'ios' ? 10 : 3 }
        />
        <TouchableOpacity style={styles.viewOriginalBtn}>
          <Ionicons name="eye-outline" size={16} color="#5f3dc4" />
          <Text style={styles.viewOriginalText}>View Original</Text>
        </TouchableOpacity>
      </View>

      {/* Merchant */}
      <Text style={styles.labelTitle}>Merchant</Text>
      <View style={styles.inputBox}>
        <Ionicons name="storefront-outline" size={20} color="#5f3dc4" style={{ marginRight: 10 }} />
        <TextInput
          style={styles.inputText}
          value={merchant}
          onChangeText={setMerchant}
        />
      </View>

      {/* Total Amount */}
      <Text style={styles.labelTitle}>Total Amount</Text>
      <View style={styles.inputBox}>
        <Text style={styles.currencySymbol}>$</Text>
        <TextInput
          style={[styles.inputText, styles.amountText]}
          value={amount}
          onChangeText={setAmount}
          keyboardType="numeric"
        />
      </View>

      {/* Date & Category Row */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <View style={{ flex: 1, marginRight: 8 }}>
          <Text style={styles.labelTitle}>Date</Text>
          <View style={styles.inputBox}>
            <Ionicons name="calendar-outline" size={18} color="#666" style={{ marginRight: 6 }} />
            <TextInput
              style={styles.inputText}
              value={date}
              onChangeText={setDate}
            />
          </View>
        </View>

        <View style={{ flex: 1, marginLeft: 8 }}>
          <Text style={styles.labelTitle}>Category</Text>
          <TouchableOpacity style={[styles.inputBox, { justifyContent: 'space-between' }]}>
            <Text style={styles.inputText}>{category}</Text>
            <Ionicons name="chevron-down" size={16} color="#888" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Payment Method Selector */}
      <Text style={styles.labelTitle}>Payment Method</Text>
      <View style={styles.paymentRow}>
        <TouchableOpacity
          style={[styles.paymentBtn, paymentMethod === 'Card' && styles.paymentBtnActive]}
          onPress={() => setPaymentMethod('Card')}
        >
          <Ionicons name="card-outline" size={18} color={paymentMethod === 'Card' ? '#5f3dc4' : '#666'} />
          <Text style={[styles.paymentBtnText, paymentMethod === 'Card' && styles.paymentBtnTextActive]}>
            Card
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.paymentBtn, paymentMethod === 'Cash' && styles.paymentBtnActive]}
          onPress={() => setPaymentMethod('Cash')}
        >
          <Ionicons name="cash-outline" size={18} color={paymentMethod === 'Cash' ? '#5f3dc4' : '#666'} />
          <Text style={[styles.paymentBtnText, paymentMethod === 'Cash' && styles.paymentBtnTextActive]}>
            Cash
          </Text>
        </TouchableOpacity>
      </View>

      {/* Action Buttons */}
      <View style={styles.actionRow}>
        <TouchableOpacity style={styles.retakeBtn} onPress={() => router.back()}>
          <Ionicons name="refresh" size={18} color="#222" />
          <Text style={styles.retakeText}>Retake</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.confirmBtn} onPress={handleConfirmSave}>
          <Ionicons name="checkmark" size={20} color="#fff" />
          <Text style={styles.confirmText}>Confirm & Save</Text>
        </TouchableOpacity>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fcfbfe', paddingHorizontal: 20, paddingTop: 45 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#5f3dc4' },

  imagePreviewBox: {
    height: 160, borderRadius: 16, overflow: 'hidden', justifyContent: 'center',
    alignItems: 'center', marginBottom: 20, backgroundColor: '#e2d9f3'
  },
  previewImage: { ...StyleSheet.absoluteFillObject, opacity: 0.6 },
  viewOriginalBtn: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.9)',
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20
  },
  viewOriginalText: { color: '#5f3dc4', fontSize: 13, fontWeight: '600', marginLeft: 6 },

  labelTitle: { fontSize: 13, fontWeight: '600', color: '#555', marginTop: 12, marginBottom: 6 },
  inputBox: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#efeafc',
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12
  },
  inputText: { fontSize: 15, color: '#333', fontWeight: '600', flex: 1 },
  amountText: { fontSize: 18, fontWeight: '800', color: '#111' },
  currencySymbol: { fontSize: 18, fontWeight: '700', color: '#666', marginRight: 6 },

  paymentRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  paymentBtn: {
    flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd', borderRadius: 25,
    paddingVertical: 12, marginHorizontal: 4
  },
  paymentBtnActive: { backgroundColor: '#efeafc', borderColor: '#5f3dc4', borderWidth: 1.5 },
  paymentBtnText: { marginLeft: 6, fontSize: 14, fontWeight: '600', color: '#666' },
  paymentBtnTextActive: { color: '#5f3dc4', fontWeight: '700' },

  actionRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 28 },
  retakeBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#ccc', borderRadius: 25,
    paddingVertical: 14, paddingHorizontal: 20, flex: 1, marginRight: 8
  },
  retakeText: { color: '#222', fontWeight: '700', marginLeft: 6 },
  confirmBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#5f3dc4', borderRadius: 25, paddingVertical: 14,
    paddingHorizontal: 20, flex: 2, marginLeft: 8,
    elevation: 3, shadowColor: '#5f3dc4', shadowOpacity: 0.3, shadowRadius: 6
  },
  confirmText: { color: '#fff', fontWeight: '700', fontSize: 15, marginLeft: 6 }
});