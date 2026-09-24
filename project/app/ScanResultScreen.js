import React, { useState } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, ScrollView,
    Image, Alert, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import axios from 'axios';
import { useAuth } from './context/AuthContext';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS, getCategoryInfo } from '../theme';
import ResponsiveWrapper from '../components/ResponsiveWrapper';

export default function ScanResultScreen() {
    const navigation = useNavigation();
    const route = useRoute();
    const { currentUser } = useAuth();
    const [saving, setSaving] = useState(false);

    // Get scanned data from route params (from UploadSlipScreen / OCR)
    const {
        imageUri = null,
        storeName = 'Starbucks Cafe (สตาร์บัค)',
        storeCategory = 'food',
        totalAmount = 235.00,
        items = [
            { name: 'Iced Caramel Macchiato', price: 150.00 },
            { name: 'Chocolate Croissant', price: 85.00 },
        ],
        date = new Date().toISOString(),
    } = route.params || {};

    const formatAmount = (amount) => {
        return Number(amount).toLocaleString('th-TH', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });
    };

    const handleConfirm = async () => {
        try {
            setSaving(true);
            const userId = currentUser?.id || currentUser?.userId;
            if (!userId) {
                Alert.alert('ข้อผิดพลาด', 'กรุณาเข้าสู่ระบบก่อน');
                return;
            }

            const res = await axios.post('http://10.0.2.2:3000/api/expenses', {
                userId,
                title: storeName,
                amount: totalAmount,
                type: 'expense',
                category: getCategoryInfo(storeCategory).name,
                note: items.map(i => `${i.name} ฿${formatAmount(i.price)}`).join(', '),
                date: (date || new Date().toISOString()).split('T')[0],
            });

            if (res.data?.success) {
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
                    <TouchableOpacity
                        onPress={() => navigation.goBack()}
                        style={styles.backBtn}
                    >
                        <Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>ตรวจสอบผลการสแกน</Text>
                    <View style={{ width: 40 }} />
                </View>

                <ScrollView
                    style={styles.scrollView}
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                >
                    {/* Receipt Image */}
                    {imageUri ? (
                        <View style={styles.imageCard}>
                            <Image
                                source={{ uri: imageUri }}
                                style={styles.receiptImage}
                                resizeMode="cover"
                            />
                        </View>
                    ) : (
                        <View style={styles.imageCard}>
                            <View style={styles.placeholderImage}>
                                <Ionicons name="receipt-outline" size={60} color={COLORS.textTertiary} />
                                <Text style={styles.placeholderText}>ภาพใบเสร็จ</Text>
                            </View>
                        </View>
                    )}

                    {/* Store Info */}
                    <View style={styles.infoCard}>
                        <Text style={styles.infoLabel}>ชื่อร้าน/หมวดหมู่</Text>
                        <Text style={styles.storeName}>{storeName}</Text>
                    </View>

                    {/* Total Amount */}
                    <View style={styles.amountCard}>
                        <Text style={styles.infoLabel}>จำนวนเงิน</Text>
                        <Text style={styles.totalAmount}>฿{formatAmount(totalAmount)}</Text>
                    </View>

                    {/* Item List */}
                    <View style={styles.itemsCard}>
                        <Text style={styles.itemsTitle}>รายการแต่ละรายการที่ดึงได้</Text>
                        {items.map((item, index) => (
                            <View key={index} style={styles.itemRow}>
                                <Text style={styles.itemName}>
                                    {index + 1}. {item.name}
                                </Text>
                                <Text style={styles.itemPrice}>
                                    ฿{formatAmount(item.price)}
                                </Text>
                            </View>
                        ))}
                    </View>
                </ScrollView>

                {/* Confirm Button */}
                <View style={styles.footer}>
                    <TouchableOpacity
                        style={[styles.confirmBtn, saving && styles.disabledBtn]}
                        onPress={handleConfirm}
                        disabled={saving}
                    >
                        {saving ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <>
                                <Ionicons name="checkmark-circle" size={22} color="#fff" />
                                <Text style={styles.confirmText}>ยืนยันและบันทึกข้อมูล</Text>
                            </>
                        )}
                    </TouchableOpacity>
                </View>
            </View>
        </ResponsiveWrapper>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.background,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: COLORS.white,
        paddingHorizontal: SPACING.lg,
        paddingVertical: SPACING.md,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.border,
    },
    backBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: COLORS.background,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: COLORS.textPrimary,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        padding: SPACING.lg,
        paddingBottom: 100,
    },
    imageCard: {
        backgroundColor: COLORS.white,
        borderRadius: RADIUS.lg,
        overflow: 'hidden',
        marginBottom: SPACING.lg,
        ...SHADOWS.medium,
    },
    receiptImage: {
        width: '100%',
        height: 200,
    },
    placeholderImage: {
        width: '100%',
        height: 200,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: COLORS.surface,
    },
    placeholderText: {
        marginTop: 8,
        fontSize: 14,
        color: COLORS.textTertiary,
    },
    infoCard: {
        backgroundColor: COLORS.white,
        borderRadius: RADIUS.lg,
        padding: SPACING.lg,
        marginBottom: SPACING.md,
        ...SHADOWS.small,
    },
    infoLabel: {
        fontSize: 13,
        color: COLORS.textTertiary,
        marginBottom: 4,
    },
    storeName: {
        fontSize: 18,
        fontWeight: '600',
        color: COLORS.textPrimary,
    },
    amountCard: {
        backgroundColor: COLORS.white,
        borderRadius: RADIUS.lg,
        padding: SPACING.lg,
        marginBottom: SPACING.md,
        ...SHADOWS.small,
    },
    totalAmount: {
        fontSize: 28,
        fontWeight: '700',
        color: COLORS.primary,
    },
    itemsCard: {
        backgroundColor: COLORS.white,
        borderRadius: RADIUS.lg,
        padding: SPACING.lg,
        marginBottom: SPACING.md,
        ...SHADOWS.small,
    },
    itemsTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: COLORS.textSecondary,
        marginBottom: SPACING.md,
    },
    itemRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: SPACING.sm,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.borderLight,
    },
    itemName: {
        fontSize: 15,
        color: COLORS.textPrimary,
        flex: 1,
    },
    itemPrice: {
        fontSize: 15,
        fontWeight: '600',
        color: COLORS.textPrimary,
        marginLeft: SPACING.md,
    },
    footer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        padding: SPACING.lg,
        backgroundColor: COLORS.white,
        borderTopWidth: 1,
        borderTopColor: COLORS.border,
    },
    confirmBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: COLORS.primary,
        borderRadius: RADIUS.xl,
        paddingVertical: 16,
        gap: 8,
    },
    disabledBtn: {
        opacity: 0.7,
    },
    confirmText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#fff',
    },
});
