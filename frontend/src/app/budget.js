import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getToken, http } from '@/lib/api';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS, THAI_MONTHS } from '@/lib/theme';

// id ต้องตรงกับตาราง categories (Supabase) — ชื่อไทยใช้แค่แสดงผลบนจอ
const DEFAULT_CATEGORIES = [
  { id: 1, name: 'อาหารและเครื่องดื่ม', icon: '🍔' },
  { id: 2, name: 'ช้อปปิ้ง', icon: '🛍️' },
  { id: 3, name: 'ท่องเที่ยว', icon: '✈️' },
  { id: 4, name: 'การเดินทาง', icon: '🚗' },
  { id: 5, name: 'การศึกษา', icon: '📚' },
  { id: 6, name: 'บันเทิง', icon: '🎮' },
  { id: 7, name: 'สุขภาพ', icon: '💊' },
  { id: 8, name: 'ค่าใช้จ่ายประจำ', icon: '🧾' },
  { id: 9, name: 'อื่น ๆ', icon: '📝' },
];

const formatMoney = (amount) => {
  const rounded = Math.round((parseFloat(amount) || 0) * 100) / 100;
  return '฿' + rounded.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
};

export default function BudgetScreen() {
  const router = useRouter();

  const [currentDate, setCurrentDate] = useState(new Date());
  const [totalBudget, setTotalBudget] = useState('');
  const [categories, setCategories] = useState(
    DEFAULT_CATEGORIES.map((c) => ({ ...c, amount: '' }))
  );
  const [spent, setSpent] = useState(0);
  const [categorySpent, setCategorySpent] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const numericTotal = parseFloat(String(totalBudget).replace(/,/g, '')) || 0;
  const hasBudget = numericTotal > 0;

  const fetchBudget = async () => {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;

      const month = currentDate.getMonth() + 1;
      const year = currentDate.getFullYear();
      const authHeader = { headers: { Authorization: `Bearer ${token}` } };

      const res = await http.get(`/personal/budgets?month=${month}&year=${year}`, authHeader);

      const budgets = res.data?.budgets || [];

      // งบรวมคือแถวที่ category_id เป็น null
      const overall = budgets.find(
        (b) => b.category_id === null || b.category_id === undefined
      );
      setTotalBudget(overall ? String(overall.monthly_limit) : '');

      // งบรายหมวด — จับคู่ด้วย category_id (ชื่อไม่ตรงกันเพราะ backend คืนชื่ออังกฤษ)
      const byCategory = {};
      budgets.forEach((b) => {
        if (b.category_id !== null && b.category_id !== undefined) {
          byCategory[b.category_id] = parseFloat(b.monthly_limit) || 0;
        }
      });

      setCategories(
        DEFAULT_CATEGORIES.map((c) => ({
          ...c,
          amount: byCategory[c.id] != null ? String(byCategory[c.id]) : '',
        }))
      );

      // ยอดใช้จ่ายจริงของเดือนนี้ (ดึงจาก transactions เพื่อคำนวณ % ใช้ไปแล้ว)
      const txRes = await http.get('/personal/transactions', authHeader);
      const transactions = Array.isArray(txRes.data?.transactions) ? txRes.data.transactions : [];
      let totalSpent = 0;
      const spentByCat = {};
      transactions.forEach((tx) => {
        const txDate = new Date(tx.transaction_date || tx.created_at);
        if (
          tx.type === 'expense' &&
          txDate.getMonth() === currentDate.getMonth() &&
          txDate.getFullYear() === currentDate.getFullYear()
        ) {
          const amount = parseFloat(tx.amount) || 0;
          totalSpent += amount;
          const catId = tx.categories?.id || tx.category_id || 9;
          spentByCat[catId] = (spentByCat[catId] || 0) + amount;
        }
      });
      setSpent(totalSpent);
      setCategorySpent(spentByCat);
    } catch (err) {
      console.error('Error fetching budget:', err);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchBudget();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentDate])
  );

  const changeMonth = (delta) => {
    const newDate = new Date(currentDate);
    newDate.setMonth(newDate.getMonth() + delta);
    setCurrentDate(newDate);
  };

  const updateCategoryAmount = (id, newAmount) => {
    setCategories((prev) => prev.map((cat) => (cat.id === id ? { ...cat, amount: newAmount } : cat)));
  };

  const saveBudget = async () => {
    setSaving(true);
    try {
      const token = await getToken();
      if (!token) throw new Error('ไม่พบข้อมูลการเข้าสู่ระบบ');

      const month = currentDate.getMonth() + 1;
      const year = currentDate.getFullYear();
      const headers = { Authorization: `Bearer ${token}` };

      const numeric = parseFloat(String(totalBudget).replace(/,/g, '')) || 0;

      const parsed = categories.map((c) => ({
        cat: c,
        value: parseFloat(String(c.amount).replace(/,/g, '')) || 0,
      }));
      const sumCats = parsed.reduce((s, x) => s + x.value, 0);

      if (sumCats > numeric) {
        Alert.alert('ข้อผิดพลาด', 'ยอดรวมหมวดหมู่ต้องไม่เกินงบรวม');
        setSaving(false);
        return;
      }

      let budgetAlert = null;

      // งบรวม (category_id = null)
      if (numeric > 0) {
        const res = await http.post(
          '/personal/budgets',
          { category_id: null, monthly_limit: numeric, month, year },
          { headers }
        );
        budgetAlert = res.data?.budgetAlert || null;
      }

      // งบรายหมวด (ข้ามหมวดที่ไม่ได้ใส่จำนวนเงิน)
      for (const { cat, value } of parsed) {
        if (value <= 0) continue;
        const res = await http.post(
          '/personal/budgets',
          { category_id: cat.id, monthly_limit: value, month, year },
          { headers }
        );
        budgetAlert = budgetAlert || res.data?.budgetAlert || null;
      }

      await fetchBudget();

      if (budgetAlert?.level === 'OVER') {
        Alert.alert('⚠️ เกินงบประมาณ', `คุณใช้จ่ายไปแล้ว ${(budgetAlert.percentUsed * 100).toFixed(0)}% ของงบที่ตั้งไว้`);
      } else if (budgetAlert?.level === 'WARNING') {
        Alert.alert('⚠️ ใกล้เต็มงบ', `คุณใช้จ่ายไปแล้ว ${(budgetAlert.percentUsed * 100).toFixed(0)}% ของงบที่ตั้งไว้`);
      } else {
        Alert.alert('สำเร็จ', 'บันทึกงบประมาณเรียบร้อยแล้ว');
      }
    } catch (err) {
      console.error('Error saving budget:', err);
      Alert.alert('ข้อผิดพลาด', err.message || 'ไม่สามารถบันทึกงบประมาณได้');
    } finally {
      setSaving(false);
    }
  };

  const percentage = hasBudget ? (spent / numericTotal) * 100 : 0;
  const clampedPercentage = Math.min(percentage, 100);

  let statusColor = '#10B981';
  if (percentage >= 100) statusColor = '#EF4444';
  else if (percentage >= 70) statusColor = '#F59E0B';

  const thaiYear = currentDate.getFullYear() + 543;
  const monthName = THAI_MONTHS[currentDate.getMonth()];

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={COLORS.dark} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>งบประมาณรายเดือน</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.monthSelector}>
        <TouchableOpacity onPress={() => changeMonth(-1)}>
          <Ionicons name="chevron-back" size={24} color={COLORS.primary} />
        </TouchableOpacity>
        <Text style={styles.monthSelectorText}>{`${monthName} ${thaiYear}`}</Text>
        <TouchableOpacity onPress={() => changeMonth(1)}>
          <Ionicons name="chevron-forward" size={24} color={COLORS.primary} />
        </TouchableOpacity>
      </View>

      <View style={styles.container}>
        {loading ? (
          <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 40 }} />
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            {hasBudget ? (
              <View style={styles.overviewCard}>
                <View style={[styles.mainCircle, { borderColor: statusColor, shadowColor: statusColor }]}>
                  <Text style={[styles.percentageText, { color: statusColor }]}>
                    {percentage.toFixed(0)}%
                  </Text>
                  <Text style={styles.spentText}>ใช้ไปแล้ว {formatMoney(spent)}</Text>
                  <Text style={styles.budgetText}>จากงบ {formatMoney(numericTotal)}</Text>
                </View>
                <View style={styles.progressBarContainer}>
                  <View
                    style={[styles.progressBarFill, { width: `${clampedPercentage}%`, backgroundColor: statusColor }]}
                  />
                </View>
              </View>
            ) : (
              <View style={styles.emptyBudgetCard}>
                <Ionicons name="wallet-outline" size={40} color={COLORS.gray} />
                <Text style={styles.emptyBudgetText}>ยังไม่ได้ตั้งงบประมาณเดือนนี้</Text>
              </View>
            )}

            {hasBudget && percentage >= 100 ? (
              <View style={[styles.alertCard, styles.alertCritical]}>
                <Ionicons name="warning" size={24} color="#FFFFFF" />
                <Text style={styles.alertTextCritical}>คุณใช้จ่ายเกินงบประมาณที่ตั้งไว้!</Text>
              </View>
            ) : hasBudget && percentage >= 70 ? (
              <View style={[styles.alertCard, styles.alertWarning]}>
                <Ionicons name="warning" size={24} color="#92400E" />
                <Text style={styles.alertTextWarning}>
                  คุณใช้จ่ายถึง {percentage.toFixed(0)}% ของงบประมาณแล้ว (เกิน 70%)!
                </Text>
              </View>
            ) : null}

            <View style={styles.mainBudgetCard}>
              <Text style={styles.budgetLabel}>งบประมาณรวม (บาท)</Text>
              <TextInput
                style={styles.budgetInput}
                value={totalBudget}
                onChangeText={setTotalBudget}
                keyboardType="numeric"
                placeholder="0.00"
                placeholderTextColor="#C4C4CC"
              />
              <View style={styles.infoRow}>
                <Ionicons name="warning-outline" size={16} color={COLORS.warning} />
                <Text style={styles.infoText}>แจ้งเตือนเมื่อใช้จ่ายถึง 70% ของงบประมาณ</Text>
              </View>
            </View>

            <View style={styles.categoriesSection}>
              <Text style={styles.sectionTitle}>หมวดหมู่งบประมาณ</Text>

              {categories.map((cat) => {
                const catId = cat.id;
                const catLimit = parseFloat(String(cat.amount).replace(/,/g, '')) || 0;
                const catSpent = categorySpent[catId] || 0;
                const catRatio = catLimit > 0 ? catSpent / catLimit : 0;
                const catPercentage = Math.min(catRatio * 100, 100);
                let catStatusColor = '#10B981';
                if (catLimit > 0 && catRatio >= 1) catStatusColor = '#EF4444';
                else if (catLimit > 0 && catRatio >= 0.7) catStatusColor = '#F59E0B';

                return (
                  <View key={cat.id} style={styles.categoryBlock}>
                    <View style={styles.categoryRow}>
                      <View style={styles.catLeft}>
                        <Text style={styles.catEmoji}>{cat.icon}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.catName}>{cat.name}</Text>
                          {catLimit > 0 && (
                            <Text style={[styles.catProgressText, { color: catStatusColor }]}>
                              {catRatio >= 1
                                ? `เกินงบ ${formatMoney(catSpent)} / ${formatMoney(catLimit)}`
                                : `ใช้ไป ${(catRatio * 100).toFixed(0)}% · ${formatMoney(catSpent)} / ${formatMoney(catLimit)}`}
                            </Text>
                          )}
                        </View>
                      </View>
                      <TextInput
                        style={styles.catInput}
                        value={cat.amount}
                        onChangeText={(val) => updateCategoryAmount(cat.id, val)}
                        keyboardType="numeric"
                        placeholder="0"
                        placeholderTextColor="#C4C4CC"
                      />
                    </View>
                    {catLimit > 0 && (
                      <View style={styles.miniProgressBar}>
                        <View
                          style={[styles.miniProgressFill, { width: `${catPercentage}%`, backgroundColor: catStatusColor }]}
                        />
                      </View>
                    )}
                  </View>
                );
              })}

              <Text style={styles.catWarningText}>* ยอดรวมหมวดหมู่ต้องไม่เกินงบรวม</Text>
            </View>
          </ScrollView>
        )}
      </View>

      <View style={styles.bottomContainer}>
        <TouchableOpacity style={styles.saveButton} onPress={saveBudget} disabled={saving || loading}>
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
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING.lg,
    paddingBottom: 100,
  },
  overviewCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    alignItems: 'center',
    marginBottom: SPACING.lg,
    ...SHADOWS.small,
  },
  mainCircle: {
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.white,
    marginBottom: SPACING.lg,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 15,
    elevation: 5,
  },
  percentageText: {
    fontFamily: FONTS.bold,
    fontSize: 44,
    marginBottom: 6,
  },
  spentText: {
    fontSize: 15,
    color: '#4B5563',
    fontWeight: '600',
    marginBottom: 4,
  },
  budgetText: {
    fontSize: 13,
    color: '#9CA3AF',
  },
  progressBarContainer: {
    width: '100%',
    height: 12,
    backgroundColor: '#F3F4F6',
    borderRadius: 6,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 6,
  },
  alertCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: RADIUS.lg,
    marginBottom: SPACING.lg,
  },
  alertWarning: {
    backgroundColor: '#FEF3C7',
  },
  alertCritical: {
    backgroundColor: '#EF4444',
  },
  alertTextWarning: {
    color: '#92400E',
    fontWeight: '600',
    marginLeft: 12,
    flex: 1,
  },
  alertTextCritical: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    marginLeft: 12,
    flex: 1,
  },
  emptyBudgetCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.xl,
    padding: 32,
    alignItems: 'center',
    marginBottom: SPACING.lg,
    ...SHADOWS.small,
  },
  emptyBudgetText: {
    marginTop: SPACING.md,
    fontSize: 15,
    color: '#9CA3AF',
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
    borderBottomColor: '#E5E7EB',
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
  categoryBlock: {
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  categoryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  catLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    flex: 1,
  },
  catEmoji: {
    fontSize: 22,
  },
  catName: {
    fontFamily: FONTS.medium,
    fontSize: 15,
    color: COLORS.dark,
  },
  catProgressText: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
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
    marginLeft: SPACING.md,
  },
  miniProgressBar: {
    height: 6,
    backgroundColor: '#F3F4F6',
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: 8,
  },
  miniProgressFill: {
    height: '100%',
    borderRadius: 3,
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