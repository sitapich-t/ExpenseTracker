import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, ActivityIndicator, SafeAreaView, Platform, Alert } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { useAuth } from './context/AuthContext';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS, THAI_MONTHS } from '../theme';
import ResponsiveWrapper from '../components/ResponsiveWrapper'; // Assuming this exists based on instructions

const API_URL = 'http://10.0.2.2:3000/api';

const DEFAULT_CATEGORIES = [
  { id: '1', name: 'อาหารและเครื่องดื่ม', icon: '🍔', amount: '6000' },
  { id: '2', name: 'เดินทาง', icon: '🚗', amount: '3000' },
  { id: '3', name: 'ที่พัก', icon: '🏠', amount: '7000' },
  { id: '4', name: 'บันเทิง', icon: '🎮', amount: '1000' },
  { id: '5', name: 'ช้อปปิ้ง', icon: '🛍️', amount: '2000' },
  { id: '6', name: 'อื่น ๆ', icon: '📝', amount: '1000' },
];

export default function BudgetScreen() {
  const navigation = useNavigation();
  const { user: authUser, currentUser } = useAuth();
  const user = currentUser || authUser;
  
  const [currentDate, setCurrentDate] = useState(new Date());
  const [totalBudget, setTotalBudget] = useState('20000.00');
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const getMonthStr = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  };

  const fetchBudget = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const monthStr = getMonthStr(currentDate);
      
      const [budgetRes, catRes] = await Promise.all([
        axios.get(`${API_URL}/budget?userId=${user.id}`).catch(() => ({ data: {} })),
        axios.get(`${API_URL}/budget/category?userId=${user.id}&month=${monthStr}`).catch(() => ({ data: {} }))
      ]);
      
      if (budgetRes.data?.success && budgetRes.data.data) {
        setTotalBudget((budgetRes.data.data.monthly_budget ?? 20000).toString());
      }
      
      if (catRes.data?.success && Array.isArray(catRes.data.data) && catRes.data.data.length > 0) {
        const fetchedCats = catRes.data.data;
        const mergedCats = DEFAULT_CATEGORIES.map(defaultCat => {
          const found = fetchedCats.find(c => c.category === defaultCat.name);
          return found ? { ...defaultCat, amount: (found.amount ?? 0).toString() } : defaultCat;
        });
        setCategories(mergedCats);
      } else {
        setCategories(DEFAULT_CATEGORIES); // Reset to defaults if none found
      }
    } catch (err) {
      console.error('Error fetching budget:', err);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchBudget();
    }, [user, currentDate])
  );

  const changeMonth = (delta) => {
    const newDate = new Date(currentDate);
    newDate.setMonth(newDate.getMonth() + delta);
    setCurrentDate(newDate);
  };

  const updateCategoryAmount = (id, newAmount) => {
    setCategories(prev => prev.map(cat => cat.id === id ? { ...cat, amount: newAmount } : cat));
  };

  const saveBudget = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const monthStr = getMonthStr(currentDate);
      const numericTotal = parseFloat(String(totalBudget).replace(/,/g, '')) || 0;
      
      let sumCats = 0;
      categories.forEach(c => {
        sumCats += (parseFloat(String(c.amount).replace(/,/g, '')) || 0);
      });

      if (sumCats > numericTotal) {
        Alert.alert('ข้อผิดพลาด', 'ยอดรวมหมวดหมู่ต้องไม่เกินงบรวม');
        setSaving(false);
        return;
      }

      const budgetSaveRes = await axios.post(`${API_URL}/budget`, {
        userId: user.id,
        monthlyBudget: numericTotal,
        dailyBudget: numericTotal / 30
      });
      if (!budgetSaveRes.data?.success) throw new Error('Budget save failed');

      const catPromises = categories.map(cat => {
        const catAmount = parseFloat(String(cat.amount).replace(/,/g, '')) || 0;
        return axios.post(`${API_URL}/budget/category`, {
          userId: user.id,
          category: cat.name,
          amount: catAmount,
          month: monthStr
        });
      });

      const catSaveRes = await Promise.all(catPromises);
      if (catSaveRes.some(res => !res.data?.success)) throw new Error('Category save failed');
      Alert.alert('สำเร็จ', 'บันทึกงบประมาณเรียบร้อยแล้ว');
    } catch (err) {
      console.error('Error saving budget:', err);
      Alert.alert('ข้อผิดพลาด', 'ไม่สามารถบันทึกงบประมาณได้');
    } finally {
      setSaving(false);
    }
  };

  const thaiYear = currentDate.getFullYear() + 543;
  const monthName = THAI_MONTHS[currentDate.getMonth()];

  const WrappedContent = ResponsiveWrapper || View;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={COLORS.dark} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>ตั้งค่างบประมาณรายเดือน</Text>
        <View style={{ width: 24 }} />
      </View>

      <WrappedContent style={styles.container}>
        <View style={styles.monthSelector}>
          <TouchableOpacity onPress={() => changeMonth(-1)}>
            <Ionicons name="chevron-back" size={24} color={COLORS.primary} />
          </TouchableOpacity>
          <Text style={styles.monthSelectorText}>{`${monthName} ${thaiYear}`}</Text>
          <TouchableOpacity onPress={() => changeMonth(1)}>
            <Ionicons name="chevron-forward" size={24} color={COLORS.primary} />
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 40 }} />
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            
            <View style={styles.mainBudgetCard}>
              <Text style={styles.budgetLabel}>งบประมาณรวม (บาท)</Text>
              <TextInput
                style={styles.budgetInput}
                value={totalBudget}
                onChangeText={setTotalBudget}
                keyboardType="numeric"
              />
              <View style={styles.infoRow}>
                <Ionicons name="warning-outline" size={16} color={COLORS.warning} />
                <Text style={styles.infoText}>แจ้งเตือนเมื่อใช้จ่ายถึง 70% ของงบประมาณ</Text>
              </View>
            </View>

            <View style={styles.categoriesSection}>
              <Text style={styles.sectionTitle}>หมวดหมู่งบประมาณ</Text>
              
              {categories.map((cat) => (
                <View key={cat.id} style={styles.categoryRow}>
                  <View style={styles.catLeft}>
                    <Text style={styles.catEmoji}>{cat.icon}</Text>
                    <Text style={styles.catName}>{cat.name}</Text>
                  </View>
                  <View style={styles.catRight}>
                    <TextInput
                      style={styles.catInput}
                      value={cat.amount}
                      onChangeText={(val) => updateCategoryAmount(cat.id, val)}
                      keyboardType="numeric"
                    />
                  </View>
                </View>
              ))}

              <Text style={styles.catWarningText}>* ยอดรวมหมวดหมู่ต้องไม่เกินงบรวม</Text>
            </View>

          </ScrollView>
        )}
      </WrappedContent>

      <View style={styles.bottomContainer}>
        <TouchableOpacity 
          style={styles.saveButton} 
          onPress={saveBudget}
          disabled={saving || loading}
        >
          {saving ? (
            <ActivityIndicator color={COLORS.white} />
          ) : (
            <Text style={styles.saveButtonText}>บันทึกงบประมาณ</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    paddingTop: Platform.OS === 'android' ? 25 : 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.white,
  },
  backButton: {
    padding: SPACING.xs,
  },
  headerTitle: {
    fontFamily: FONTS.bold,
    fontSize: 18,
    color: COLORS.dark,
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING.lg,
    paddingBottom: 100,
  },
  monthSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.white,
    marginBottom: SPACING.md,
  },
  monthSelectorText: {
    fontFamily: FONTS.bold,
    fontSize: 16,
    color: COLORS.primary,
    marginHorizontal: SPACING.lg,
  },
  mainBudgetCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    alignItems: 'center',
    marginBottom: SPACING.lg,
    ...SHADOWS.small,
  },
  budgetLabel: {
    fontFamily: FONTS.medium,
    fontSize: 16,
    color: COLORS.gray,
    marginBottom: SPACING.sm,
  },
  budgetInput: {
    fontFamily: FONTS.bold,
    fontSize: 32,
    color: COLORS.primary,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightGray,
    minWidth: 150,
    textAlign: 'center',
    paddingVertical: SPACING.sm,
    marginBottom: SPACING.md,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    backgroundColor: '#FFFBEB',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md,
  },
  infoText: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: COLORS.warning,
  },
  categoriesSection: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    ...SHADOWS.small,
  },
  sectionTitle: {
    fontFamily: FONTS.bold,
    fontSize: 18,
    color: COLORS.dark,
    marginBottom: SPACING.md,
  },
  categoryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  catLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  catEmoji: {
    fontSize: 24,
  },
  catName: {
    fontFamily: FONTS.medium,
    fontSize: 16,
    color: COLORS.dark,
  },
  catRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  catInput: {
    fontFamily: FONTS.bold,
    fontSize: 16,
    color: COLORS.primary,
    backgroundColor: '#F3F4F6',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.md,
    minWidth: 100,
    textAlign: 'right',
  },
  catWarningText: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: COLORS.danger,
    marginTop: SPACING.md,
    textAlign: 'center',
  },
  bottomContainer: {
    padding: SPACING.lg,
    backgroundColor: COLORS.white,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  saveButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    ...SHADOWS.medium,
  },
  saveButtonText: {
    fontFamily: FONTS.bold,
    fontSize: 16,
    color: COLORS.white,
  },
});