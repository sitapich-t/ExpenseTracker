import React, { useState } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, ScrollView,
    Image, Alert, ActivityIndicator, TextInput, Modal, FlatList
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import axios from 'axios';
import { useAuth } from './context/AuthContext';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../theme';
import ResponsiveWrapper from '../components/ResponsiveWrapper';

const API_URL = 'http://10.0.2.2:3000/api';

const CATEGORIES = [
    { id: 'Food', label: 'Food (อาหาร)', icon: 'restaurant-outline' },
    { id: 'Transport', label: 'Transport (เดินทาง)', icon: 'bus-outline' },
    { id: 'Housing', label: 'Housing (ที่พัก)', icon: 'home-outline' },
    { id: 'Entertainment', label: 'Entertainment (บันเทิง)', icon: 'film-outline' },
    { id: 'Shopping', label: 'Shopping (ช้อปปิ้ง)', icon: 'cart-outline' },
    { id: 'Education', label: 'Education (การศึกษา)', icon: 'book-outline' },
    { id: 'Health', label: 'Health (สุขภาพ)', icon: 'medkit-outline' },
    { id: 'Bills', label: 'Bills (ค่าบริการ)', icon: 'receipt-outline' },
    { id: 'Other', label: 'Other (อื่นๆ)', icon: 'ellipsis-horizontal-outline' },
];

export default function ScanResultScreen() {
    const navigation = useNavigation();
    const route = useRoute();
    const { currentUser } = useAuth();
    const [saving, setSaving] = useState(false);

    // Get scanned data from route params
    const {
        imageUri = null,
        storeName = '',
        storeCategory = 'Food',
        totalAmount = 0,
        items = [],
        date = new Date().toISOString(),
        transactionId = null
    } = route.params || {};

    const formatInitialDate = (isoString) => {
        if (!isoString) return '';
        try {
            const d = new Date(isoString);
            return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
        } catch (e) {
            return isoString;
        }
    };

    const [editedStoreName, setEditedStoreName] = useState(storeName);
    const [editedAmount, setEditedAmount] = useState(totalAmount?.toString());
    const [editedDate, setEditedDate] = useState(formatInitialDate(date));
    const [editedItems, setEditedItems] = useState(items.length > 0 ? items : [{ name: '', price: '' }]);
    const [selectedCategory, setSelectedCategory] = useState(storeCategory || 'Food');
    const [paymentMethod, setPaymentMethod] = useState('Cash');
    const [isCategoryModalVisible, setCategoryModalVisible] = useState(false);

    const handleUpdateItem = (index, field, value) => {
        const newItems = [...editedItems];
        newItems[index] = { ...newItems[index], [field]: value };
        setEditedItems(newItems);
    };

    const handleDeleteItem = (index) => {
        const newItems = [...editedItems];
        newItems.splice(index, 1);
        setEditedItems(newItems);
    };

    const handleAddItem = () => {
        setEditedItems([...editedItems, { name: '', price: '' }]);
    };

    const handleConfirm = async () => {
        try {
            setSaving(true);
            const userId = currentUser?.id || currentUser?.userId || 'demo_user';
            
            const payload = {
                userId,
                title: editedStoreName || 'สแกนใบเสร็จ',
                amount: parseFloat(editedAmount) || 0,
                type: 'expense',
                category: selectedCategory,
                note: `ชำระผ่าน: ${paymentMethod}\n${editedItems.map(i => `${i.name} (฿${i.price})`).join(', ')}`,
                date: editedDate || new Date().toISOString(),
            };

            const res = await axios.post(`${API_URL}/expenses`, payload);

            if (res.data?.success || res.status === 201 || res.status === 200) {
                Alert.alert('สำเร็จ', 'บันทึกรายการเรียบร้อยแล้ว', [
                    { text: 'ตกลง', onPress: () => navigation.navigate('Home') },
                ]);
            } else {
                Alert.alert('ข้อผิดพลาด', 'ไม่สามารถบันทึกรายการได้');
            }
        } catch (error) {
            console.error('Save error:', error);
            Alert.alert('ข้อผิดพลาด', 'ไม่สามารถบันทึกรายการได้');
        } finally {
            setSaving(false);
        }
    };

    return (
        <ResponsiveWrapper>
            <View style={styles.container}>
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                        <Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>ตรวจสอบผลการสแกน</Text>
                    <View style={{ width: 40 }} />
                </View>

                <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                    {/* Image Preview */}
                    {imageUri ? (
                        <View style={styles.imageCard}>
                            <Image source={{ uri: imageUri }} style={styles.receiptImage} resizeMode="cover" />
                        </View>
                    ) : (
                        <View style={styles.imageCard}>
                            <View style={styles.placeholderImage}>
                                <Ionicons name="receipt-outline" size={60} color={COLORS.textTertiary} />
                                <Text style={styles.placeholderText}>ไม่มีภาพใบเสร็จ</Text>
                            </View>
                        </View>
                    )}

                    {/* Transaction ID / View Original */}
                    {transactionId && (
                        <View style={styles.txCard}>
                            <Text style={styles.infoLabel}>Transaction ID</Text>
                            <Text style={styles.txText}>{transactionId}</Text>
                        </View>
                    )}

                    {/* Store Name Editable */}
                    <View style={styles.card}>
                        <Text style={styles.infoLabel}>ชื่อร้าน / Merchant</Text>
                        <TextInput
                            style={styles.textInput}
                            value={editedStoreName}
                            onChangeText={setEditedStoreName}
                            placeholder="ระบุชื่อร้านค้า"
                        />
                    </View>

                    {/* Date Editable */}
                    <View style={styles.card}>
                        <Text style={styles.infoLabel}>วันที่ (DD/MM/YYYY)</Text>
                        <TextInput
                            style={styles.textInput}
                            value={editedDate}
                            onChangeText={setEditedDate}
                            placeholder="DD/MM/YYYY"
                        />
                    </View>

                    {/* Category Picker */}
                    <View style={styles.card}>
                        <Text style={styles.infoLabel}>หมวดหมู่</Text>
                        <TouchableOpacity style={styles.categoryPickerBtn} onPress={() => setCategoryModalVisible(true)}>
                            <Text style={styles.categoryPickerText}>
                                {CATEGORIES.find(c => c.id === selectedCategory)?.label || selectedCategory}
                            </Text>
                            <Ionicons name="chevron-down" size={20} color={COLORS.textSecondary} />
                        </TouchableOpacity>
                    </View>

                    {/* Payment Method Selector */}
                    <View style={styles.card}>
                        <Text style={styles.infoLabel}>ช่องทางการชำระเงิน</Text>
                        <View style={styles.paymentMethodRow}>
                            {['Card', 'Cash', 'E-Banking'].map(method => (
                                <TouchableOpacity 
                                    key={method} 
                                    style={[styles.paymentChip, paymentMethod === method && styles.paymentChipSelected]}
                                    onPress={() => setPaymentMethod(method)}
                                >
                                    <Text style={[styles.paymentChipText, paymentMethod === method && styles.paymentChipTextSelected]}>
                                        {method === 'Card' ? '💳 Card' : method === 'Cash' ? '💵 Cash' : '🏦 E-Banking'}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>

                    {/* Total Amount Editable */}
                    <View style={styles.amountCard}>
                        <Text style={styles.infoLabel}>จำนวนเงินรวม</Text>
                        <View style={styles.amountInputContainer}>
                            <Text style={styles.amountPrefix}>฿</Text>
                            <TextInput
                                style={styles.amountInput}
                                value={editedAmount}
                                onChangeText={setEditedAmount}
                                keyboardType="numeric"
                                placeholder="0.00"
                            />
                        </View>
                    </View>

                    {/* Items List Editable */}
                    <View style={styles.itemsCard}>
                        <View style={styles.itemsHeader}>
                            <Text style={styles.itemsTitle}>รายการสินค้า</Text>
                            <TouchableOpacity onPress={handleAddItem}>
                                <Ionicons name="add-circle" size={24} color={COLORS.primary} />
                            </TouchableOpacity>
                        </View>
                        
                        {editedItems.map((item, index) => (
                            <View key={index} style={styles.itemRow}>
                                <TextInput 
                                    style={[styles.itemInput, { flex: 2 }]} 
                                    value={item.name}
                                    onChangeText={(text) => handleUpdateItem(index, 'name', text)}
                                    placeholder="ชื่อรายการ"
                                />
                                <TextInput 
                                    style={[styles.itemInput, { flex: 1, marginHorizontal: 8 }]} 
                                    value={item.price?.toString()}
                                    onChangeText={(text) => handleUpdateItem(index, 'price', text)}
                                    keyboardType="numeric"
                                    placeholder="ราคา"
                                />
                                <TouchableOpacity onPress={() => handleDeleteItem(index)}>
                                    <Ionicons name="close-circle" size={24} color={COLORS.danger || '#FF3B30'} />
                                </TouchableOpacity>
                            </View>
                        ))}
                        {editedItems.length === 0 && (
                            <Text style={styles.noItemsText}>ไม่มีรายการสินค้า</Text>
                        )}
                    </View>
                </ScrollView>

                {/* Footer Buttons */}
                <View style={styles.footerRow}>
                    <TouchableOpacity style={styles.retakeBtn} onPress={() => navigation.goBack()}>
                        <Ionicons name="camera" size={20} color={COLORS.primary} />
                        <Text style={styles.retakeText}>ถ่ายใหม่</Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity
                        style={[styles.confirmBtn, saving && styles.disabledBtn]}
                        onPress={handleConfirm}
                        disabled={saving}
                    >
                        {saving ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <>
                                <Ionicons name="checkmark-circle" size={20} color="#fff" />
                                <Text style={styles.confirmText}>ยืนยันและบันทึก</Text>
                            </>
                        )}
                    </TouchableOpacity>
                </View>
            </View>

            {/* Category Picker Modal */}
            <Modal visible={isCategoryModalVisible} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>เลือกหมวดหมู่</Text>
                            <TouchableOpacity onPress={() => setCategoryModalVisible(false)}>
                                <Ionicons name="close" size={24} color={COLORS.textPrimary} />
                            </TouchableOpacity>
                        </View>
                        <FlatList
                            data={CATEGORIES}
                            keyExtractor={(item) => item.id}
                            renderItem={({ item }) => (
                                <TouchableOpacity 
                                    style={styles.categoryItem}
                                    onPress={() => {
                                        setSelectedCategory(item.id);
                                        setCategoryModalVisible(false);
                                    }}
                                >
                                    <Ionicons name={item.icon} size={24} color={COLORS.primary} style={{ marginRight: 12 }} />
                                    <Text style={styles.categoryItemText}>{item.label}</Text>
                                    {selectedCategory === item.id && (
                                        <Ionicons name="checkmark" size={24} color={COLORS.primary} />
                                    )}
                                </TouchableOpacity>
                            )}
                        />
                    </View>
                </View>
            </Modal>
        </ResponsiveWrapper>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.background },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        backgroundColor: COLORS.white, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
        borderBottomWidth: 1, borderBottomColor: COLORS.border,
    },
    backBtn: {
        width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background,
    },
    headerTitle: { fontSize: 18, fontWeight: '600', color: COLORS.textPrimary },
    scrollView: { flex: 1 },
    scrollContent: { padding: SPACING.lg, paddingBottom: 100 },
    imageCard: {
        backgroundColor: COLORS.white, borderRadius: RADIUS.lg, overflow: 'hidden', marginBottom: SPACING.lg, ...SHADOWS.medium,
    },
    receiptImage: { width: '100%', height: 200 },
    placeholderImage: { width: '100%', height: 200, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.surface },
    placeholderText: { marginTop: 8, fontSize: 14, color: COLORS.textTertiary },
    card: {
        backgroundColor: COLORS.white, borderRadius: RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.md, ...SHADOWS.small,
    },
    txCard: {
        backgroundColor: COLORS.white, borderRadius: RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.md, ...SHADOWS.small,
    },
    txText: { fontSize: 14, color: COLORS.textPrimary, marginTop: 4 },
    infoLabel: { fontSize: 13, color: COLORS.textTertiary, marginBottom: 8 },
    textInput: {
        borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, padding: SPACING.md, fontSize: 16, color: COLORS.textPrimary,
    },
    categoryPickerBtn: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, padding: SPACING.md,
    },
    categoryPickerText: { fontSize: 16, color: COLORS.textPrimary },
    paymentMethodRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
    paymentChip: {
        flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: RADIUS.full, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.white,
    },
    paymentChipSelected: {
        backgroundColor: COLORS.primary, borderColor: COLORS.primary,
    },
    paymentChipText: { fontSize: 14, color: COLORS.textPrimary, fontWeight: '500' },
    paymentChipTextSelected: { color: COLORS.white },
    amountCard: {
        backgroundColor: COLORS.white, borderRadius: RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.md, ...SHADOWS.small,
    },
    amountInputContainer: { flexDirection: 'row', alignItems: 'center' },
    amountPrefix: { fontSize: 24, fontWeight: '700', color: COLORS.primary, marginRight: 8 },
    amountInput: {
        flex: 1, fontSize: 24, fontWeight: '700', color: COLORS.primary, padding: 0,
    },
    itemsCard: {
        backgroundColor: COLORS.white, borderRadius: RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.md, ...SHADOWS.small,
    },
    itemsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.md },
    itemsTitle: { fontSize: 16, fontWeight: '600', color: COLORS.textPrimary },
    itemRow: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.sm },
    itemInput: {
        borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.sm, padding: SPACING.sm, fontSize: 14, color: COLORS.textPrimary,
    },
    noItemsText: { fontSize: 14, color: COLORS.textTertiary, textAlign: 'center', marginVertical: SPACING.md },
    footerRow: {
        position: 'absolute', bottom: 0, left: 0, right: 0, padding: SPACING.lg, backgroundColor: COLORS.white, borderTopWidth: 1, borderTopColor: COLORS.border, flexDirection: 'row', gap: 12,
    },
    retakeBtn: {
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.primary, borderRadius: RADIUS.xl, paddingVertical: 16, gap: 8,
    },
    retakeText: { fontSize: 16, fontWeight: '600', color: COLORS.primary },
    confirmBtn: {
        flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.primary, borderRadius: RADIUS.xl, paddingVertical: 16, gap: 8,
    },
    disabledBtn: { opacity: 0.7 },
    confirmText: { fontSize: 16, fontWeight: '600', color: '#fff' },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalContent: {
        backgroundColor: COLORS.white, borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, padding: SPACING.lg, maxHeight: '80%',
    },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.lg },
    modalTitle: { fontSize: 18, fontWeight: '600', color: COLORS.textPrimary },
    categoryItem: {
        flexDirection: 'row', alignItems: 'center', paddingVertical: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight,
    },
    categoryItemText: { flex: 1, fontSize: 16, color: COLORS.textPrimary },
});
