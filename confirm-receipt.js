import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image,
  TextInput, ScrollView, Alert, Platform, Modal, FlatList
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';

// รายการหมวดหมู่ให้เลือก
const CATEGORIES = [
  { label: 'Food & Drink', icon: 'fast-food-outline' },
  { label: 'Groceries', icon: 'cart-outline' },
  { label: 'Transport', icon: 'car-outline' },
  { label: 'Shopping', icon: 'bag-handle-outline' },
  { label: 'Bills & Utilities', icon: 'flash-outline' },
  { label: 'Entertainment', icon: 'film-outline' },
  { label: 'Health', icon: 'medkit-outline' },
  { label: 'Education', icon: 'book-outline' },
  { label: 'Transfer', icon: 'swap-horizontal-outline' },
  { label: 'Other', icon: 'ellipsis-horizontal-outline' },
];

export default function ConfirmReceiptScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const fileName = params.fileName;
  const imageUri = fileName
    ? `${FileSystem.documentDirectory}${fileName}`
    : null;

  console.log('📸 File name:', fileName);
  console.log('📸 Confirm imageUri:', imageUri);

  // ================================
// ดึง "ชื่อร้าน" จากผล OCR
// ================================

function extractMerchant(ocrText, backendMerchant) {
  // คำที่ไม่ใช่ชื่อร้าน
  const ignorePatterns = [
    /ใบเสร็จ/i,
    /ใบกำกับ/i,
    /receipt/i,
    /invoice/i,
    /tax/i,
    /vat/i,
    /เลขที่/i,
    /เลขประจำตัว/i,
    /วันที่/i,
    /เวลา/i,
    /รวม/i,
    /ยอด/i,
    /ยอดสุทธิ/i,
    /subtotal/i,
    /total/i,
    /net/i,
    /เงินสด/i,
    /เงินทอน/i,
    /cash/i,
    /change/i,
    /สมาชิก/i,
    /คะแนน/i,
    /แต้ม/i,
    /โทร/i,
    /โทรศัพท์/i,
    /tel/i,
    /www/i,
    /http/i,
    /ขอบคุณ/i,
    /ลูกค้า/i,
    /บริการ/i,
    /แนะนำ/i,
    /ติดต่อ/i,
    /คืนสินค้า/i,
    /เปลี่ยนสินค้า/i,
    /ชำระ/i,
    /สิทธิ์/i,
    /สามารถ/i,
    // คำสถานะ/UI ของแอปชำระเงินดิจิทัล (สลิปโอนเงิน ไม่ใช่ใบเสร็จร้านค้า)
    /payment\s*completed/i,
    /payment\s*success/i,
    /transaction\s*id/i,
    /view\s*original/i,
    /โอนเงิน/i,
    /โอนสำเร็จ/i,
    /ทำรายการสำเร็จ/i,
    /qr\s*code/i,
    /อ้างอิง/i,
  ];

  // ทำความสะอาดชื่อ
  const cleanName = (text) => {
    if (!text) return '';

    let name = String(text)
      .replace(/\r/g, '')
      .trim();

    // ลบอักขระขยะด้านหน้า
    name = name.replace(/^[^ก-๙a-zA-Z0-9]+/, '');

    // ลบข้อความในวงเล็บ เช่น (แพงแสน)
    name = name.replace(/\s*\([^)]*\)/g, '');

    // ลบเบอร์โทร
    name = name.replace(/\b0\d{8,9}\b/g, '');

    // ลบเลข TAX ID
    name = name.replace(/\b\d{10,15}\b/g, '');

    // ลบ POS / VAT / TAX ID ที่ตามหลัง
    name = name.replace(
      /\b(POS|VAT|TAX\s*ID)\b.*$/i,
      ''
    );

    // ลบ | และข้อความหลัง |
    name = name.replace(/\|.*$/g, '');

    // ช่องว่างซ้ำ
    name = name.replace(/\s+/g, ' ').trim();

    return name;
  };

  // ตรวจว่าดูเหมือนชื่อร้านหรือไม่
  const isValidMerchant = (text) => {
    if (!text || text.length < 2) {
      return false;
    }

    // ต้องมีตัวอักษรที่ "ติดกัน" อย่างน้อย 2 ตัว (กันขยะแบบ ม "ท ที่เป็นตัวอักษรโดดๆ)
    if (!/[ก-๙]{2,}|[a-zA-Z]{2,}/.test(text)) {
      return false;
    }

    // ไม่เอาข้อความที่มีคำต้องห้าม
    if (ignorePatterns.some(pattern => pattern.test(text))) {
      return false;
    }

    // ชื่อร้านไม่ควรยาวเป็นประโยค
    if (text.length > 40) {
      return false;
    }

    // ถ้ามีภาษาไทยติดกันยาวมาก มักเป็นประโยคจาก OCR
    const thaiWords = text.match(/[ก-๙]{2,}/g) || [];

    if (thaiWords.length >= 5) {
      return false;
    }

    // ถ้ามีตัวเลขเยอะ ไม่เอา
    const numbers = text.match(/\d/g) || [];

    if (numbers.length >= 5) {
      return false;
    }

    // กันบรรทัดที่ส่วนใหญ่เป็นสัญลักษณ์/ขยะ OCR ปนตัวอักษรจริงแค่นิดเดียว
    const meaningfulChars = (text.match(/[ก-๙a-zA-Z0-9]/g) || []).length;

    if (meaningfulChars < text.length * 0.5) {
      return false;
    }

    // เศษขยะสั้นๆ (เช่น "โร" ที่มาจากโลโก้/ตัวอักษรหลุด) ไม่ควรถูกนับเป็นชื่อร้าน
    if (meaningfulChars < 4) {
      return false;
    }

    return true;
  };

  // =================================
  // 1. ลองใช้ Backend Merchant ก่อน
  // =================================

  const backendName = cleanName(backendMerchant);

  if (isValidMerchant(backendName)) {
    return backendName;
  }

  // =================================
  // 2. ถ้า Backend ส่งชื่อผิด
  // ให้หาใหม่จาก OCR Text
  // =================================

  if (ocrText) {
    const lines = String(ocrText)
      .split('\n')
      .map(line => cleanName(line))
      .filter(line => line.length > 0);

    // ชื่อร้านมักอยู่ช่วงบนของใบเสร็จ
    const topLines = lines.slice(0, 15);

    // ให้คะแนนแต่ละบรรทัด
    const candidates = topLines
      .map((line, index) => {

        if (!isValidMerchant(line)) {
          return null;
        }

        let score = 100 - index * 5;

        // คำที่มีโอกาสเป็นชื่อร้าน (อังกฤษ)
        if (
          /\b(market|mart|cafe|café|coffee|shop|store|restaurant|food|bakery)\b/i.test(line)
        ) {
          score += 50;
        }

        // คำที่มีโอกาสเป็นชื่อร้าน (ไทย)
        if (
          /(คาเฟ่|ร้านกาแฟ|ร้านอาหาร|เบเกอรี่|มินิมาร์ท|ซุปเปอร์มาร์เก็ต|ก๋วยเตี๋ยว|ร้าน)/.test(line)
        ) {
          score += 50;
        }

        // มีภาษาอังกฤษ
        if (/[a-zA-Z]{2,}/.test(line)) {
          score += 20;
        }

        // มีภาษาไทย
        if (/[ก-๙]{2,}/.test(line)) {
          score += 10;
        }

        // ชื่อร้านภาษาอังกฤษมักเป็นคำขึ้นต้นด้วยตัวใหญ่หลายคำติดกัน (Proper Noun)
        // ต้องมีความยาวรวมอย่างน้อย 3 ตัวอักษร กันคำย่อสั้นๆ (เช่น "Cn") ได้คะแนนเกินจริง
        const capitalizedWords = (line.match(/\b[A-Z][a-zA-Z'-]{2,}\b/g) || []).length;
        score += capitalizedWords * 15;

        // บรรทัดที่มีเนื้อหายาว/มีสาระมากกว่า มักเป็นชื่อร้านเต็มมากกว่าเศษขยะสั้นๆ ให้น้ำหนักเป็น 2 เท่า
        const meaningfulChars = (line.match(/[ก-๙a-zA-Z0-9]/g) || []).length;
        score += Math.min(meaningfulChars * 2, 20);

        return {
          text: line,
          score
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score);

    if (candidates.length > 0) {
      let result = candidates[0].text;

      // =================================
      // ถ้ามี Market / Cafe / Coffee ฯลฯ
      // ตัดให้เหลือชื่อร้าน
      // =================================

      const brandMatch = result.match(
        /([ก-๙A-Za-z][ก-๙A-Za-z0-9 .&'-]{1,35}\b(?:Market|Mart|Cafe|Café|Coffee|Shop|Store|Restaurant|Bakery))/i
      );

      if (brandMatch) {
        result = brandMatch[1].trim();
      }

      return result;
    }
  }

  // =================================
  // 3. หาไม่ได้จริง ๆ
  // =================================

  return 'ร้านค้าทั่วไป';
}


// ดึง OCR Text จาก params
const parsedText = params.parsedText
  ? String(params.parsedText)
  : '';

// Merchant ที่ Backend ส่งมา
const backendMerchant = params.merchant
  ? String(params.merchant)
  : '';

// เอาชื่อร้านที่ผ่านการกรองแล้ว
const detectedMerchant = extractMerchant(
  parsedText,
  backendMerchant
);

console.log('🏪 Backend Merchant:', backendMerchant);
console.log('🧾 OCR Text:', parsedText);
console.log('🏪 FINAL Merchant:', detectedMerchant);


// ประเภทเอกสาร: 'receipt' (ใบเสร็จร้านค้า) หรือ 'transfer_slip' (สลิปโอนเงิน)
const documentType = params.documentType
  ? String(params.documentType)
  : 'receipt';
const isTransferSlip = documentType === 'transfer_slip';
const bankName = params.bankName ? String(params.bankName) : '';
const transactionId = params.transactionId ? String(params.transactionId) : '';

// State
const [merchant, setMerchant] = useState(detectedMerchant);
const [amount, setAmount] = useState(params.amount || '');
const [date, setDate] = useState(params.date || '');
  const [category, setCategory] = useState(params.category || 'Food & Drink');
  const [categoryModalVisible, setCategoryModalVisible] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState(isTransferSlip ? 'Transfer' : 'Card'); // 'Card' | 'Cash' | 'Transfer'
  const [showOriginal, setShowOriginal] = useState(false);
  const handleConfirmSave = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      const response = await fetch('http://192.168.1.45:3000/api/transactions/create', {
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
          date: date,
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
    <View style={{ flex: 1, backgroundColor: '#fcfbfe' }}>
    <ScrollView style={styles.container}showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="close" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Confirm Details</Text>
        <View style={{ width: 24 }} />
      </View>

   <View style={styles.imagePreviewBox}>
  {imageUri ? (
    <Image
      source={{ uri: imageUri }}
      style={styles.previewImage}
      resizeMode="cover"
      onLoad={() => console.log('✅ Receipt image loaded')}
      onError={(error) =>
        console.log('❌ Receipt image error:', error.nativeEvent)
      }
    />
  ) : (
    <View style={styles.noImageBox}>
      <Ionicons name="image-outline" size={40} color="#999" />
      <Text style={{ color: '#999', marginTop: 8 }}>
        ไม่พบรูปใบเสร็จ
      </Text>
    </View>
  )}

  {/* View Original */}
  <View style={styles.viewOriginalWrapper}>
    <TouchableOpacity
      style={styles.viewOriginalBtn}
      onPress={() => setShowOriginal(true)}
    >
      <Ionicons name="eye-outline" size={16} color="#5f3dc4" />
      <Text style={styles.viewOriginalText}>
        View Original
      </Text>
    </TouchableOpacity>
  </View>
</View>

      {/* Merchant / ผู้รับเงิน */}
      <Text style={styles.labelTitle}>{isTransferSlip ? 'ผู้รับเงิน / ผู้โอน' : 'Merchant'}</Text>
      <View style={styles.inputBox}>
        <Ionicons
          name={isTransferSlip ? 'person-outline' : 'storefront-outline'}
          size={20}
          color="#5f3dc4"
          style={{ marginRight: 10 }}
        />
        <TextInput
          style={styles.inputText}
          value={merchant}
          onChangeText={setMerchant}
        />
      </View>

      {/* ธนาคาร / เลขอ้างอิง (แสดงเฉพาะสลิปโอนเงิน) */}
      {isTransferSlip && (bankName || transactionId) && (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          {bankName ? (
            <View style={{ flex: 1, marginRight: transactionId ? 8 : 0 }}>
              <Text style={styles.labelTitle}>ธนาคาร</Text>
              <View style={styles.inputBox}>
                <Ionicons name="business-outline" size={18} color="#5f3dc4" style={{ marginRight: 8 }} />
                <Text style={styles.inputText}>{bankName}</Text>
              </View>
            </View>
          ) : null}
          {transactionId ? (
            <View style={{ flex: bankName ? 1.4 : 1, marginLeft: bankName ? 8 : 0 }}>
              <Text style={styles.labelTitle}>เลขอ้างอิง</Text>
              <View style={styles.inputBox}>
                <Ionicons name="barcode-outline" size={18} color="#5f3dc4" style={{ marginRight: 8 }} />
                <Text style={styles.inputText} numberOfLines={1} ellipsizeMode="tail">
                  {transactionId}
                </Text>
              </View>
            </View>
          ) : null}
        </View>
      )}

      {/* Total Amount */}
      <Text style={styles.labelTitle}>{isTransferSlip ? 'จำนวนเงินที่โอน' : 'Total Amount'}</Text>
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
          <TouchableOpacity
            style={[styles.inputBox, { justifyContent: 'space-between' }]}
            onPress={() => setCategoryModalVisible(true)}
          >
            <Text style={styles.inputText}>{category}</Text>
            <Ionicons name="chevron-down" size={16} color="#888" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Category Picker Modal */}
      <Modal
        visible={categoryModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCategoryModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setCategoryModalVisible(false)}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>เลือกหมวดหมู่</Text>
            <FlatList
              data={CATEGORIES}
              keyExtractor={(item) => item.label}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.categoryRow,
                    category === item.label && styles.categoryRowActive,
                  ]}
                  onPress={() => {
                    setCategory(item.label);
                    setCategoryModalVisible(false);
                  }}
                >
                  <Ionicons
                    name={item.icon}
                    size={20}
                    color={category === item.label ? '#5f3dc4' : '#666'}
                    style={{ marginRight: 12 }}
                  />
                  <Text
                    style={[
                      styles.categoryRowText,
                      category === item.label && styles.categoryRowTextActive,
                    ]}
                  >
                    {item.label}
                  </Text>
                  {category === item.label && (
                    <Ionicons
                      name="checkmark"
                      size={18}
                      color="#5f3dc4"
                      style={{ marginLeft: 'auto' }}
                    />
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Payment Method Selector (ไม่ต้องเลือกถ้าเป็นสลิปโอนเงิน เพราะรู้อยู่แล้วว่าเป็นการโอนผ่านธนาคาร) */}
      {!isTransferSlip && (
        <>
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
        </>
      )}

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
    {showOriginal && (
        <View style={styles.originalOverlay}>
          <TouchableOpacity
            style={styles.closeOriginalBtn}
            onPress={() => setShowOriginal(false)}
          >
           <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>

          <Image
            source={{ uri: imageUri }}
            style={styles.originalImage}
            resizeMode="contain"
         />
       </View>
      )}
   </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fcfbfe', paddingHorizontal: 20, paddingTop: 45 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#5f3dc4' },

  // Category picker modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCard: {
    width: '80%',
    maxHeight: '60%',
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
    textAlign: 'center',
    marginBottom: 8,
    paddingVertical: 6,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  categoryRowActive: {
    backgroundColor: '#f1ecfc',
  },
  categoryRowText: {
    fontSize: 15,
    color: '#333',
  },
  categoryRowTextActive: {
    color: '#5f3dc4',
    fontWeight: '600',
  },

  imagePreviewBox: {
      height: 180, borderRadius: 16, overflow: 'hidden', marginBottom: 20,
      backgroundColor: '#e2d9f3', position: 'relative',
},
  previewImage: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%',},
  viewOriginalWrapper: {
  position: 'absolute',
  bottom: 10,
  left: 0,
  right: 0,
  alignItems: 'center',
},

viewOriginalBtn: {
  flexDirection: 'row',
  alignItems: 'center',
  backgroundColor: 'rgba(255,255,255,0.95)',
  paddingHorizontal: 16,
  paddingVertical: 8,
  borderRadius: 20,
  elevation: 3,
  shadowColor: '#000',
  shadowOpacity: 0.15,
  shadowRadius: 4,
},
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
  confirmText: { color: '#fff', fontWeight: '700', fontSize: 15, marginLeft: 6 },
  noImageBox: {...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', backgroundColor: '#e2d9f3',},
  originalOverlay: {position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center', zIndex: 999,},
  originalImage: {width: '100%', height: '80%',},
  closeOriginalBtn: {position: 'absolute', top: 50, right: 20, zIndex: 1000,},
  
});