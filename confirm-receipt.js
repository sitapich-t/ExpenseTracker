import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image,
  TextInput, ScrollView, Alert, Modal, FlatList
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { API_URL, getToken } from '@/lib/api';
import { getScannedImage, clearScannedImage } from '@/utils/scannedImageStore';

// ---------- Helper: แปลง ISO string -> DD/MM/YYYY สำหรับแสดงผลใน UI ----------
function isoToDisplayDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = d.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

// ---------- Helper: แปลง DD/MM/YYYY กลับเป็น ISO string ตอนบันทึก ----------
function displayDateToIso(display) {
  const match = String(display).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const [, dd, mm, yyyy] = match.map(Number);
  return new Date(Date.UTC(yyyy, mm - 1, dd)).toISOString();
}

// รายการหมวดหมู่ให้เลือก
const CATEGORIES = [
  { id: 1, label: 'Food', icon: 'fast-food-outline' },
  { id: 2, label: 'Shopping', icon: 'bag-handle-outline' },
  { id: 3, label: 'Travel', icon: 'airplane-outline' },
  { id: 4, label: 'Transport', icon: 'car-outline' },
  { id: 5, label: 'Study', icon: 'book-outline' },
  { id: 6, label: 'Entertainment', icon: 'film-outline' },
  { id: 7, label: 'Health', icon: 'medkit-outline' },
  { id: 8, label: 'Bills', icon: 'flash-outline' },
  { id: 9, label: 'Other', icon: 'ellipsis-horizontal-outline' },
];

const DEFAULT_CATEGORY_ID = 1;

export default function ConfirmReceiptScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const paramsImageUri = params.imageUri ? String(params.imageUri) : null;
  const imageUri = getScannedImage() || paramsImageUri;

  // ================================
  // ดึง "ชื่อร้าน" จากผล OCR
  // ================================
  function extractMerchant(ocrText, backendMerchant) {
    const ignorePatterns = [
      /ใบเสร็จ/i, /ใบกำกับ/i, /receipt/i, /invoice/i, /tax/i, /vat/i, /เลขที่/i, /เลขประจำตัว/i,
      /วันที่/i, /เวลา/i, /รวม/i, /ยอด/i, /ยอดสุทธิ/i, /subtotal/i, /total/i, /net/i, /เงินสด/i,
      /เงินทอน/i, /cash/i, /change/i, /สมาชิก/i, /คะแนน/i, /แต้ม/i, /โทร/i, /โทรศัพท์/i, /tel/i,
      /www/i, /http/i, /ขอบคุณ/i, /ลูกค้า/i, /บริการ/i, /แนะนำ/i, /ติดต่อ/i, /คืนสินค้า/i,
      /เปลี่ยนสินค้า/i, /ชำระ/i, /สิทธิ์/i, /สามารถ/i, /payment\s*completed/i, /payment\s*success/i,
      /transaction\s*id/i, /view\s*original/i, /โอนเงิน/i, /โอนสำเร็จ/i, /ทำรายการสำเร็จ/i,
      /qr\s*code/i, /อ้างอิง/i, /\bkbank\b/i, /\bk\s*\+\b/i, /\bk\s*plus\b/i, /\bscb\b/i, /\bbbl\b/i,
      /\bkrungthai\b/i, /\bktb\b/i, /\bttb\b/i, /\bbay\b/i, /พร้อม[เแ]พย์/i, /promptpay/i,
      /พร้อมเพย์/i, /กสิกรไทย/i, /ไทยพาณิชย์/i, /กรุงเทพ/i, /กรุงไทย/i, /กรุงศรี/i, /^ไปยัง\b/i,
      /^จาก\b/i, /เติมเงินสำเร็จ/i, /การเติมเงิน/i, /จำนวนเงิน/i, /จำนวน/i, /top\s*up/i,
      /ข้อมูลเพิ่มเติม/i, /ผู้ให้บริการ/i, /ผู้รับเงิน/i, /ผู้โอน/i, /สแกน/i, /คิวอาร์โค้ด/i,
      /ตรวจสอบ/i, /สถานะ/i,
    ];

    const cleanName = (text) => {
      if (!text) return '';
      let name = String(text)
        .normalize('NFC')
        .replace(/\u0E4D\u0E32/g, '\u0E33')
        .replace(/\r/g, '')
        .trim();
      name = name.replace(/^[^ก-๙a-zA-Z0-9]+/, '');
      name = name.replace(/\s*\([^)]*\)/g, '');
      name = name.replace(/\b0\d{8,9}\b/g, '');
      name = name.replace(/\b\d{10,15}\b/g, '');
      name = name.replace(/\b(POS|VAT|TAX\s*ID)\b.*$/i, '');
      name = name.replace(/\|.*$/g, '');
      name = name.replace(/\s+/g, ' ').trim();

      const hasRealWordRun = (w) => /[a-zA-Zก-๙]{2,}/.test(w);
      let words = name.split(' ').filter(Boolean);

      while (words.length > 1 && !hasRealWordRun(words[words.length - 1])) words.pop();
      while (words.length > 1 && !hasRealWordRun(words[0])) words.shift();

      name = words.join(' ').trim();
      words = name.split(' ');
      if (words.length > 1 && words[0].toLowerCase() === 'จาก') return '';

      const leadingUiJunk = ['ดู', 'ดูรายละเอียด', 'ดูต้นฉบับ', 'view', 'ไปยัง', 'จาก'];
      if (words.length > 1 && leadingUiJunk.includes(words[0].toLowerCase())) {
        words.shift();
        name = words.join(' ').trim();
      }
      return name;
    };

    const isValidMerchant = (text) => {
      if (!text || text.length < 2) return false;
      if (/^เติมเงินพร้อมเพย์$/i.test(text.trim())) return true;
      if (/^\s*(KBank|K\+|K\s*PLUS|SCB|BBL|Krungthai|KTB|TTB|BAY|PromptPay|Payment\s*Completed)\s*[+\-]?\s*$/i.test(text)) return false;
      if (/x{2,}/i.test(text) && /\d/.test(text)) return false;
      if (/^(MS\.|MR\.|MRS\.|MISS|นาย|นาง|นางสาว|น\.ส\.)\s*/i.test(text)) return false;
      if (!/[ก-๙]{3,}|[a-zA-Z]{3,}/.test(text)) return false;
      if (ignorePatterns.some(p => p.test(text))) return false;
      if (text.length > 40) return false;
      return true;
    };

    const backendName = cleanName(backendMerchant);
    if (isValidMerchant(backendName)) return backendName;

    if (ocrText) {
      const rawLines = String(ocrText).normalize('NFC').replace(/\u0E4D\u0E32/g, '\u0E33').split('\n');
      const infoIndex = rawLines.findIndex(l => /ข้อมูลเพิ่มเติมจากผู้ให้บริการ/i.test(l));
      const scopedLines = infoIndex !== -1 ? rawLines.slice(0, infoIndex) : rawLines;

      const lines = scopedLines.map(line => cleanName(line)).filter(line => line.length > 0);
      const topLines = lines.slice(0, 15);

      const candidates = topLines
        .map((line, index) => {
          if (!isValidMerchant(line)) return null;
          let score = 100 - index * 5;
          if (/\b(market|mart|cafe|café|coffee|shop|store|restaurant|food|bakery)\b/i.test(line)) score += 50;
          if (/(คาเฟ่|ร้านกาแฟ|ร้านอาหาร|เบเกอรี่|มินิมาร์ท|ซุปเปอร์มาร์เก็ต|ก๋วยเตี๋ยว|ร้าน)/.test(line)) score += 50;
          return { text: line, score };
        })
        .filter(Boolean)
        .sort((a, b) => b.score - a.score);

      if (candidates.length > 0) return candidates[0].text;
    }
    return 'ร้านค้าทั่วไป';
  }

  const parsedText = params.parsedText ? String(params.parsedText) : '';
  const backendMerchant = params.merchant ? String(params.merchant) : '';
  const detectedMerchant = extractMerchant(parsedText, backendMerchant);

  const documentType = params.documentType ? String(params.documentType) : 'receipt';
  const isTransferSlip = documentType === 'transfer_slip';
  const bankName = params.bankName ? String(params.bankName) : '';

  // ดึง lineItems ที่ผ่านการสกัดจาก backend/OCR
  const initialLineItems = (() => {
    try {
      if (params.lineItems) {
        return typeof params.lineItems === 'string' ? JSON.parse(params.lineItems) : params.lineItems;
      }
    } catch (_e) {
      console.log('Error parsing lineItems params');
    }
    return [];
  })();

  const initialCategoryId = (() => {
    const fromParams = Number(params.categoryId);
    const isValidId = CATEGORIES.some((c) => c.id === fromParams);
    return isValidId ? fromParams : DEFAULT_CATEGORY_ID;
  })();

  // States
  const [merchant, setMerchant] = useState(detectedMerchant);
  const [amount, setAmount] = useState(params.amount || '');
  const [vat, setVat] = useState(params.vat || '0');
  const [serviceCharge, setServiceCharge] = useState(params.serviceCharge || '0');

  const [date, setDate] = useState(isoToDisplayDate(params.date));
  const [categoryId, setCategoryId] = useState(initialCategoryId);
  const [categoryModalVisible, setCategoryModalVisible] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState(isTransferSlip ? 'Transfer' : 'Card');
  const [showOriginal, setShowOriginal] = useState(false);

    // ✨ State สำหรับรายการสินค้า
  const [lineItems, setLineItems] = useState(initialLineItems);

  // ป้องกัน state ค้างจากรอบก่อนหน้า เมื่อ navigate มาหน้านี้ซ้ำด้วย params ใหม่
  // (useState initializer รันแค่ครั้งแรกที่ mount เท่านั้น ไม่รู้ว่า params เปลี่ยน)
  // รวมทุก field ไว้ใน useEffect เดียว เพื่อไม่ให้ re-render ซ้อนกันหลายรอบตอน params เปลี่ยนพร้อมกัน
  useEffect(() => {
    setMerchant(detectedMerchant);
    setAmount(params.amount || '');
    setVat(params.vat || '0');
    setServiceCharge(params.serviceCharge || '0');
    setDate(isoToDisplayDate(params.date));
    setCategoryId(initialCategoryId);
    setLineItems(initialLineItems);
    setPaymentMethod(isTransferSlip ? 'Transfer' : 'Card');
  }, [params.merchant, params.amount, params.vat, params.serviceCharge, params.date, params.lineItems, params.documentType]);
  const selectedCategory = CATEGORIES.find((c) => c.id === categoryId) || CATEGORIES[0];
  // ----------------------------------------------------
  // Helper Logic สำหรับจัดการ Line Items
  // ----------------------------------------------------
  const recalculateTotal = (items) => {
    const sum = items.reduce((acc, item) => {
      const p = parseFloat(item.price) || 0;
      const q = parseInt(item.quantity, 10) || 1;
      return acc + p * q;
    }, 0);
    if (sum > 0) {
      setAmount(sum.toFixed(2));
    }
  };

  const handleUpdateItem = (index, field, value) => {
    const updated = [...lineItems];
    updated[index] = { ...updated[index], [field]: value };
    setLineItems(updated);
    if (field === 'price' || field === 'quantity') {
      recalculateTotal(updated);
    }
  };

  const handleRemoveItem = (index) => {
    const updated = lineItems.filter((_, i) => i !== index);
    setLineItems(updated);
    recalculateTotal(updated);
  };

  const handleAddItem = () => {
    const updated = [...lineItems, { name: '', quantity: 1, price: 0 }];
    setLineItems(updated);
  };

  // ----------------------------------------------------
  // Save Handler
  // ----------------------------------------------------
  const handleConfirmSave = async () => {
    try {
      const token = await getToken();
      const response = await fetch(`${API_URL}/api/v1/personal/transactions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: merchant,
          amount: parseFloat(amount) || 0,
          netAmount: (parseFloat(amount) || 0) - (parseFloat(vat) || 0) - (parseFloat(serviceCharge) || 0),
          vat: parseFloat(vat) || 0,
          serviceCharge: parseFloat(serviceCharge) || 0,
          type: 'expense',
          category_id: categoryId,
          merchant: merchant,
          transaction_date: displayDateToIso(date) || new Date().toISOString(),
          paymentMethod: paymentMethod,
          items: lineItems,
        }),
      });

      if (!response.ok) {
        const bodyText = await response.text();
        let errData = {};
        try { errData = JSON.parse(bodyText); } catch (_e) { /* ignore */ }
        throw new Error(errData.message || errData.error || `HTTP ${response.status}`);
      }

      clearScannedImage();
      Alert.alert('สำเร็จ', 'บันทึกใบเสร็จเรียบร้อยแล้ว', [
        { text: 'ตกลง', onPress: () => router.replace('/(main)/dashboard') },
      ]);
    } catch (err) {
      Alert.alert('Error', err.message || 'ไม่สามารถบันทึกใบเสร็จได้');
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#fcfbfe' }}>
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="close" size={24} color="#333" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Confirm Details</Text>
          <View style={{ width: 24 }} />
        </View>

        {/* Image Preview */}
        <View style={styles.imagePreviewBox}>
          {imageUri ? (
            <Image
              source={{ uri: imageUri }}
              style={styles.previewImage}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.noImageBox}>
              <Ionicons name="image-outline" size={40} color="#999" />
              <Text style={{ color: '#999', marginTop: 8 }}>ไม่พบรูปใบเสร็จ</Text>
            </View>
          )}

          <View style={styles.viewOriginalWrapper}>
            <TouchableOpacity
              style={styles.viewOriginalBtn}
              onPress={() => setShowOriginal(true)}
            >
              <Ionicons name="eye-outline" size={16} color="#5f3dc4" />
              <Text style={styles.viewOriginalText}>View Original</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Merchant */}
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

        {/* Bank Name (if transfer slip) */}
        {/* {isTransferSlip && bankName ? (
          <View>
            <Text style={styles.labelTitle}>ธนาคาร</Text>
            <View style={styles.inputBox}>
              <Ionicons name="business-outline" size={18} color="#5f3dc4" style={{ marginRight: 8 }} />
              <Text style={styles.inputText}>{bankName}</Text>
            </View>
          </View>
        ) : null} */}

        {/* ✨ SECTION: รายการสินค้า (แสดงเฉพาะใบเสร็จ) */}
        {!isTransferSlip && (
          <View style={styles.itemsSection}>
            <View style={styles.itemsHeader}>
              <Text style={styles.labelTitle}>รายการสินค้า ({lineItems.length})</Text>
              <TouchableOpacity onPress={handleAddItem} style={styles.addItemBtn}>
                <Ionicons name="add-circle-outline" size={16} color="#5f3dc4" />
                <Text style={styles.addItemBtnText}>เพิ่มรายการ</Text>
              </TouchableOpacity>
            </View>

            {lineItems.length === 0 ? (
              <Text style={styles.emptyItemsText}>ไมพบรายการย่อย ดึงเฉพาะยอดรวม</Text>
            ) : (
              lineItems.map((item, index) => (
                <View key={index} style={styles.itemRow}>
                  {/* จำนวน */}
                  <TextInput
                    style={styles.itemQtyInput}
                    value={String(item.quantity || 1)}
                    keyboardType="numeric"
                    onChangeText={(val) => handleUpdateItem(index, 'quantity', val)}
                  />
                  
                  {/* ชื่อสินค้า */}
                  <TextInput
                    style={styles.itemNameInput}
                    value={item.name}
                    placeholder="ชื่อรายการ"
                    placeholderTextColor="#aaa"
                    onChangeText={(val) => handleUpdateItem(index, 'name', val)}
                  />

                  {/* ราคา */}
                  <TextInput
                    style={styles.itemPriceInput}
                    value={String(item.price ?? '')}
                    keyboardType="numeric"
                    placeholder="0.00"
                    placeholderTextColor="#aaa"
                    onChangeText={(val) => handleUpdateItem(index, 'price', val)}
                  />

                  {/* ปุ่มลบ */}
                  <TouchableOpacity
                    onPress={() => handleRemoveItem(index)}
                    style={styles.removeItemBtn}
                  >
                    <Ionicons name="trash-outline" size={18} color="#e74c3c" />
                  </TouchableOpacity>
                </View>
              ))
            )}
          </View>
        )}

        {/* Total Amount */}
        <Text style={styles.labelTitle}>{isTransferSlip ? 'จำนวนเงินที่โอน' : 'Total Amount'}</Text>
        <View style={styles.inputBox}>
          <Text style={styles.currencySymbol}>฿</Text>
          <TextInput
            style={[styles.inputText, styles.amountText]}
            value={amount}
            onChangeText={setAmount}
            keyboardType="numeric"
          />
        </View>

        {/* VAT & Service Charge (เฉพาะใบเสร็จ ไม่ใช่สลิปโอนเงิน) */}
        {!isTransferSlip && (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.labelTitle}>VAT</Text>
              <View style={styles.inputBox}>
                <Text style={styles.currencySymbol}>฿</Text>
                <TextInput
                  style={styles.inputText}
                  value={String(vat)}
                  onChangeText={setVat}
                  keyboardType="numeric"
                />
              </View>
            </View>

            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text style={styles.labelTitle}>Service Charge</Text>
              <View style={styles.inputBox}>
                <Text style={styles.currencySymbol}>฿</Text>
                <TextInput
                  style={styles.inputText}
                  value={String(serviceCharge)}
                  onChangeText={setServiceCharge}
                  keyboardType="numeric"
                />
              </View>
            </View>
          </View>
        )}

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
              <Text style={styles.inputText}>{selectedCategory.label}</Text>
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
                keyExtractor={(item) => String(item.id)}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[
                      styles.categoryRow,
                      categoryId === item.id && styles.categoryRowActive,
                    ]}
                    onPress={() => {
                      setCategoryId(item.id);
                      setCategoryModalVisible(false);
                    }}
                  >
                    <Ionicons
                      name={item.icon}
                      size={20}
                      color={categoryId === item.id ? '#5f3dc4' : '#666'}
                      style={{ marginRight: 12 }}
                    />
                    <Text
                      style={[
                        styles.categoryRowText,
                        categoryId === item.id && styles.categoryRowTextActive,
                      ]}
                    >
                      {item.label}
                    </Text>
                    {categoryId === item.id && (
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

        {/* Payment Method Selector */}
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

              <TouchableOpacity
                style={[styles.paymentBtn, paymentMethod === 'E-Banking' && styles.paymentBtnActive]}
                onPress={() => setPaymentMethod('E-Banking')}
              >
                <Ionicons name="cash-outline" size={18} color={paymentMethod === 'E-Banking' ? '#5f3dc4' : '#666'} />
                <Text style={[styles.paymentBtnText, paymentMethod === 'E-Banking' && styles.paymentBtnTextActive]}>
                  E-Banking
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

      {/* Modal ดูรูปต้นฉบับ */}
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
    height: 180, borderRadius: 16, overflow: 'hidden', marginBottom: 12,
    backgroundColor: '#e2d9f3', position: 'relative',
  },
  previewImage: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
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
  viewOriginalText: { color: '#5f3dc4', fontSize: 13, fontWeight: '600', marginLeft: 6 },

  labelTitle: { fontSize: 13, fontWeight: '600', color: '#555', marginTop: 12, marginBottom: 6 },
  inputBox: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#efeafc',
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12
  },
  inputText: { fontSize: 15, color: '#333', fontWeight: '600', flex: 1 },
  amountText: { fontSize: 18, fontWeight: '800', color: '#111' },
  currencySymbol: { fontSize: 18, fontWeight: '700', color: '#666', marginRight: 6 },

  // ✨ Styles สำหรับ Line Items Section
  itemsSection: {
    marginTop: 8,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#eee',
  },
  itemsHeader: {
    flexDirection: 'row',
    justify: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  addItemBtn: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  addItemBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#5f3dc4',
    marginLeft: 4,
  },
  emptyItemsText: {
    fontSize: 13,
    color: '#999',
    fontStyle: 'italic',
    paddingVertical: 8,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  itemQtyInput: {
    width: 36,
    height: 38,
    backgroundColor: '#f3effc',
    borderRadius: 8,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginRight: 8,
  },
  itemNameInput: {
    flex: 1,
    height: 38,
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: 14,
    color: '#333',
    marginRight: 8,
  },
  itemPriceInput: {
    width: 70,
    height: 38,
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 8,
    paddingHorizontal: 8,
    textAlign: 'right',
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginRight: 6,
  },
  removeItemBtn: {
    padding: 6,
  },

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
  noImageBox: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', backgroundColor: '#e2d9f3' },
  originalOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center', zIndex: 999 },
  originalImage: { width: '100%', height: '80%' },
  closeOriginalBtn: { position: 'absolute', top: 50, right: 20, zIndex: 1000 },
});