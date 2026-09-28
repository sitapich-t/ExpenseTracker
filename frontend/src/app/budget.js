import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal, TextInput, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { getToken, http } from '@/lib/api';
import { Ionicons } from '@expo/vector-icons';

const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

const CATEGORY_ICONS = {
  Food: { icon: 'fast-food', color: '#f59e0b', name: 'อาหาร' },
  Shopping: { icon: 'cart', color: '#ec4899', name: 'ช้อปปิ้ง' },
  Travel: { icon: 'airplane', color: '#0ea5e9', name: 'ท่องเที่ยว' },
  Transport: { icon: 'car', color: '#3b82f6', name: 'เดินทาง' },
  Study: { icon: 'book', color: '#8b5cf6', name: 'การศึกษา' },
  Entertainment: { icon: 'game-controller', color: '#10b981', name: 'บันเทิง' },
  Health: { icon: 'medkit', color: '#ef4444', name: 'สุขภาพ' },
  Bills: { icon: 'receipt', color: '#64748b', name: 'บิลต่างๆ' },
  Other: { icon: 'ellipsis-horizontal-circle', color: '#94a3b8', name: 'อื่นๆ' },
};

// 1=Food, 2=Shopping, 3=Travel, 4=Transport, 5=Study, 6=Entertainment, 7=Health, 8=Bills, 9=Other
const CATEGORY_ID = {
  Food: 1, Shopping: 2, Travel: 3, Transport: 4,
  Study: 5, Entertainment: 6, Health: 7, Bills: 8, Other: 9,
};

const CATEGORY_BY_ID = Object.fromEntries(
  Object.entries(CATEGORY_ICONS).map(([catName, info]) => [CATEGORY_ID[catName], info])
);

const EDITOR_CATEGORIES = Object.entries(CATEGORY_ICONS).map(([catName, info]) => ({
  id: CATEGORY_ID[catName],
  name: info.name,
  icon: info.icon,
}));

export default function BudgetScreen() {
  const router = useRouter();

  const [currentDate, setCurrentDate] = useState(new Date());
  const currentMonth = currentDate.getMonth();
  const currentYear = currentDate.getFullYear();

  // งบรวม / งบหมวด
  const [budgetId, setBudgetId] = useState(null);
  const [budget, setBudgetAmount] = useState(0);
  const [hasBudget, setHasBudget] = useState(false);
  const [spent, setSpent] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isModalVisible, setModalVisible] = useState(false);
  const [tempBudget, setTempBudget] = useState('');
  const [categoryBudgets, setCategoryBudgets] = useState({});
  const [categorySpent, setCategorySpent] = useState({});
  const [modalCategoryId, setModalCategoryId] = useState(null);

  // ตัวแก้ไขงบแบบกรอก (งบรวม + งบหมวด)
  const [totalBudget, setTotalBudget] = useState('');
  const [categories, setCategories] = useState(
    EDITOR_CATEGORIES.map((c) => ({ ...c, amount: '' }))
  );

  const changeMonth = (delta) => {
    const newDate = new Date(currentDate);
    newDate.setMonth(newDate.getMonth() + delta);
    setCurrentDate(newDate);
  };

  const updateCategoryAmount = (id, newAmount) => {
    setCategories((prev) =>
      prev.map((cat) => (cat.id === id ? { ...cat, amount: newAmount } : cat))
    );
  };

  const fetchBudgetData = async () => {
    try {
      setLoading(true);

      const token = await getToken();
      if (!token) {
        setLoading(false);
        return;
      }

      const authHeader = { headers: { Authorization: `Bearer ${token}` } };

      const budgetRes = await http.get(
        `/personal/budgets?month=${currentMonth + 1}&year=${currentYear}`,
        authHeader
      );
      const budgets = budgetRes.data.budgets || [];
      const overallBudget = budgets.find((b) => b.category_id === null);

      if (overallBudget) {
        setBudgetId(overallBudget.id);
        setBudgetAmount(parseFloat(overallBudget.monthly_limit));
        setHasBudget(true);
        setTotalBudget(String(overallBudget.monthly_limit));
      } else {
        setBudgetId(null);
        setBudgetAmount(0);
        setHasBudget(false);
        setTotalBudget('');
      }

      const catBudgetMap = {};
      budgets.forEach((b) => {
        if (b.category_id !== null && b.category_id !== undefined) {
          catBudgetMap[b.category_id] = {
            budgetId: b.id,
            monthly_limit: parseFloat(b.monthly_limit),
          };
        }
      });
      setCategoryBudgets(catBudgetMap);

      setCategories(
        EDITOR_CATEGORIES.map((c) => ({
          ...c,
          amount: catBudgetMap[c.id] != null ? String(catBudgetMap[c.id].monthly_limit) : '',
        }))
      );

      const response = await http.get('/personal/transactions', authHeader);
      const transactions = response.data.transactions || [];

      let totalSpent = 0;
      const spentByCat = {};

      transactions.forEach((tx) => {
        const txDate = new Date(tx.transaction_date || tx.created_at);
        if (
          tx.type === 'expense' &&
          txDate.getMonth() === currentMonth &&
          txDate.getFullYear() === currentYear
        ) {
          const amount = parseFloat(tx.amount);
          totalSpent += amount;

          const catId = tx.categories?.id || tx.category_id || 9;
          if (!spentByCat[catId]) spentByCat[catId] = 0;
          spentByCat[catId] += amount;
        }
      });

      setSpent(totalSpent);
      setCategorySpent(spentByCat);
    } catch (error) {
      console.error('Error fetching budget data:', error);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchBudgetData();
    }, [currentMonth, currentYear])
  );

  // บันทึกจาก Modal (งบรวมหรืองบหมวด)
  const handleSaveBudget = async () => {
    if (!tempBudget || isNaN(tempBudget) || parseFloat(tempBudget) <= 0) {
      Alert.alert('ข้อผิดพลาด', 'กรุณาระบุจำนวนเงินที่ถูกต้อง');
      return;
    }

    try {
      setSaving(true);
      const token = await getToken();
      if (!token) {
        Alert.alert('ข้อผิดพลาด', 'กรุณาเข้าสู่ระบบใหม่อีกครั้ง');
        return;
      }

      const authHeader = { headers: { Authorization: `Bearer ${token}` } };
      const isCategory = modalCategoryId !== null && modalCategoryId !== undefined;
      const existingBudget = isCategory
        ? (categoryBudgets[modalCategoryId] || null)
        : (budgetId ? { budgetId } : null);

      const payload = {
        monthly_limit: parseFloat(tempBudget),
        month: currentMonth + 1,
        year: currentYear,
      };
      if (isCategory) {
        payload.category_id = modalCategoryId;
      }

      let res;
      if (existingBudget) {
        res = await http.put(`/personal/budgets/${existingBudget.budgetId}`, payload, authHeader);
      } else {
        res = await http.post('/personal/budgets', payload, authHeader);
      }

      const savedBudget = res.data.budget;

      if (isCategory) {
        setCategoryBudgets((prev) => ({
          ...prev,
          [modalCategoryId]: {
            budgetId: savedBudget.id,
            monthly_limit: parseFloat(savedBudget.monthly_limit),
          },
        }));
        setCategories((prev) =>
          prev.map((cat) =>
            cat.id === modalCategoryId
              ? { ...cat, amount: String(savedBudget.monthly_limit) }
              : cat
          )
        );
      } else {
        setBudgetId(savedBudget.id);
        setBudgetAmount(parseFloat(savedBudget.monthly_limit));
        setHasBudget(true);
        setTotalBudget(String(savedBudget.monthly_limit));
      }

      setModalVisible(false);
      setTempBudget('');

      const alert = res.data.budgetAlert;
      if (alert?.level === 'OVER') {
        Alert.alert('เกินงบประมาณ', `คุณใช้จ่ายไปแล้ว ${(alert.percentUsed * 100).toFixed(0)}% ของงบที่ตั้งไว้`);
      } else if (alert?.level === 'WARNING') {
        Alert.alert('ใกล้เต็มงบ', `คุณใช้จ่ายไปแล้ว ${(alert.percentUsed * 100).toFixed(0)}% ของงบที่ตั้งไว้`);
      }
    } catch (error) {
      console.error('Error saving budget:', error);
      Alert.alert('ข้อผิดพลาด', 'ไม่สามารถบันทึกงบประมาณได้');
    } finally {
      setSaving(false);
    }
  };

  // บันทึกงบจากฟอร์มกรอก (งบรวม + งบหมวดพร้อมกัน)
  const saveBudgetForm = async () => {
    setSaving(true);
    try {
      const token = await getToken();
      if (!token) throw new Error('ไม่พบข้อมูลการเข้าสู่ระบบ');

      const month = currentMonth + 1;
      const year = currentYear;
      const headers = { Authorization: `Bearer ${token}` };

      const numericTotal = parseFloat(String(totalBudget).replace(/,/g, '')) || 0;

      const parsed = categories.map((c) => ({
        cat: c,
        value: parseFloat(String(c.amount).replace(/,/g, '')) || 0,
      }));
      const sumCats = parsed.reduce((s, x) => s + x.value, 0);

      if (sumCats > numericTotal && numericTotal > 0) {
        Alert.alert('ข้อผิดพลาด', 'ยอดรวมหมวดหมู่ต้องไม่เกินงบรวม');
        return;
      }

      if (numericTotal > 0) {
        await http.post(
          '/personal/budgets',
          { category_id: null, monthly_limit: numericTotal, month, year },
          { headers }
        );
      }

      for (const { cat, value } of parsed) {
        if (value <= 0) continue;
        await http.post(
          '/personal/budgets',
          { category_id: cat.id, monthly_limit: value, month, year },
          { headers }
        );
      }

      Alert.alert('สำเร็จ', 'บันทึกงบประมาณเรียบร้อยแล้ว');
      fetchBudgetData();
    } catch (err) {
      console.error('Error saving budget:', err);
      Alert.alert('ข้อผิดพลาด', err.message || 'ไม่สามารถบันทึกงบประมาณได้');
    } finally {
      setSaving(false);
    }
  };

  const percentage = budget > 0 ? (spent / budget) * 100 : 0;
  const clampedPercentage = Math.min(percentage, 100);

  let statusColor = '#10b981';
  if (percentage >= 100) statusColor = '#ef4444';
  else if (percentage >= 80) statusColor = '#f59e0b';

  const formatMoney = (amount) => {
    return '฿' + amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>งบประมาณรายเดือน</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.monthSelector}>
        <TouchableOpacity onPress={() => changeMonth(-1)}>
          <Ionicons name="chevron-back" size={24} color="#5f3dc4" />
        </TouchableOpacity>
        <Text style={styles.monthSelectorText}>{`${THAI_MONTHS[currentMonth]} ${currentYear}`}</Text>
        <TouchableOpacity onPress={() => changeMonth(1)}>
          <Ionicons name="chevron-forward" size={24} color="#5f3dc4" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#5f3dc4" />
        </View>
      ) : (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
          {!hasBudget ? (
            <View style={styles.emptyBudgetCard}>
              <Ionicons name="wallet-outline" size={40} color="#9ca3af" />
              <Text style={styles.emptyBudgetText}>ยังไม่ได้ตั้งงบประมาณเดือนนี้</Text>
            </View>
          ) : (
            <View style={styles.budgetCard}>
              <View style={[styles.mainCircle, { borderColor: statusColor, shadowColor: statusColor }]}>
                <Text style={[styles.percentageText, { color: statusColor }]}>
                  {percentage.toFixed(0)}%
                </Text>
                <Text style={styles.spentText}>ใช้ไปแล้ว {formatMoney(spent)}</Text>
                <Text style={styles.budgetText}>จากงบ {formatMoney(budget)}</Text>
              </View>

              <View style={styles.progressBarContainer}>
                <View style={[styles.progressBarFill, { width: `${clampedPercentage}%`, backgroundColor: statusColor }]} />
              </View>
            </View>
          )}

          {hasBudget && percentage >= 100 ? (
            <View style={[styles.alertCard, styles.alertCritical]}>
              <Ionicons name="warning" size={24} color="#fff" />
              <Text style={styles.alertTextCritical}>คุณใช้จ่ายเกินงบประมาณที่ตั้งไว้!</Text>
            </View>
          ) : hasBudget && percentage >= 80 ? (
            <View style={[styles.alertCard, styles.alertWarning]}>
              <Ionicons name="warning" size={24} color="#92400e" />
              <Text style={styles.alertTextWarning}>คุณใช้จ่ายเกิน 80% ของงบประมาณแล้ว!</Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={styles.editButton}
            onPress={() => {
              setModalCategoryId(null);
              setTempBudget(hasBudget ? budget.toString() : '');
              setModalVisible(true);
            }}
          >
            <Ionicons name="create-outline" size={20} color="#fff" />
            <Text style={styles.editButtonText}>ตั้งค่างบประมาณรวม</Text>
          </TouchableOpacity>

          <View style={styles.categoriesSection}>
            <Text style={styles.sectionTitle}>งบประมาณตามหมวดหมู่</Text>
            <Text style={styles.sectionSubtitle}>แตะ &quot;ตั้งงบ&quot; เพื่อกำหนดงบในแต่ละหมวด</Text>

            {Object.entries(CATEGORY_ICONS).map(([catName, catInfo]) => {
              const catId = CATEGORY_ID[catName];
              const catBudgetInfo = categoryBudgets[catId];
              const catBudget = catBudgetInfo ? catBudgetInfo.monthly_limit : 0;
              const hasCatBudget = !!catBudgetInfo;
              const amount = categorySpent[catId] || 0;

              const catRatio = catBudget > 0 ? amount / catBudget : 0;
              const catPercentage = Math.min(catRatio * 100, 100);
              let catStatusColor = '#10b981';
              if (catBudget > 0 && catRatio >= 1) catStatusColor = '#ef4444';
              else if (catBudget > 0 && catRatio >= 0.8) catStatusColor = '#f59e0b';

              return (
                <View key={catName} style={styles.categoryRow}>
                  <View style={[styles.iconContainer, { backgroundColor: catInfo.color + '20' }]}>
                    <Ionicons name={catInfo.icon} size={20} color={catInfo.color} />
                  </View>
                  <View style={styles.categoryInfo}>
                    <View style={styles.categoryHeader}>
                      <Text style={styles.categoryName}>{catInfo.name}</Text>
                      <Text style={styles.categoryAmount}>
                        {hasCatBudget ? `${formatMoney(amount)} / ${formatMoney(catBudget)}` : formatMoney(amount)}
                      </Text>
                    </View>
                    <View style={styles.miniProgressBar}>
                      <View style={[styles.miniProgressFill, { width: `${catPercentage}%`, backgroundColor: catStatusColor }]} />
                    </View>
                    <View style={styles.categoryBudgetActions}>
                      {hasCatBudget ? (
                        <Text style={[styles.catPercentText, { color: catStatusColor }]}>
                          {`${catRatio >= 1 ? 'เกินงบ' : `ใช้ไป ${(catRatio * 100).toFixed(0)}%`}`}
                        </Text>
                      ) : (
                        <Text style={styles.noBudgetText}>ยังไม่ได้ตั้งงบหมวดนี้</Text>
                      )}
                      <TouchableOpacity
                        style={styles.setCatBudgetBtn}
                        onPress={() => {
                          setModalCategoryId(catId);
                          setTempBudget(hasCatBudget ? catBudget.toString() : '');
                          setModalVisible(true);
                        }}
                      >
                        <Ionicons name={hasCatBudget ? 'create-outline' : 'add'} size={16} color="#5f3dc4" />
                        <Text style={styles.setCatBudgetText}>{hasCatBudget ? 'แก้ไขงบ' : 'ตั้งงบ'}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>

          <TouchableOpacity
            style={styles.saveFormBtn}
            onPress={saveBudgetForm}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.saveFormText}>บันทึกงบประมาณ</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      )}

      <Modal
        animationType="slide"
        transparent={true}
        visible={isModalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {modalCategoryId !== null && modalCategoryId !== undefined
                ? `ตั้งงบ ${CATEGORY_BY_ID[modalCategoryId]?.name || 'หมวด'}`
                : 'ตั้งค่างบประมาณรวม'}
            </Text>
            <Text style={styles.modalSubtitle}>
              ระบุงบประมาณสำหรับ{modalCategoryId !== null && modalCategoryId !== undefined
                ? `หมวด ${CATEGORY_BY_ID[modalCategoryId]?.name || ''}`
                : `เดือน ${THAI_MONTHS[currentMonth]}`}{' '}{currentYear}
            </Text>

            <TextInput
              style={styles.input}
              value={tempBudget}
              onChangeText={setTempBudget}
              keyboardType="numeric"
              placeholder="จำนวนเงิน"
              editable={!saving}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setModalVisible(false)}
                disabled={saving}
              >
                <Text style={styles.cancelButtonText}>ยกเลิก</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.saveButton]}
                onPress={handleSaveBudget}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.saveButtonText}>บันทึก</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fcfbfe',
  },
  container: {
    flex: 1,
    backgroundColor: '#fcfbfe',
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fcfbfe',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 12,
    marginBottom: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  headerDate: {
    fontSize: 16,
    color: '#6b7280',
  },
  monthSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 8,
    marginBottom: 8,
  },
  monthSelectorText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
  },
  emptyBudgetCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    marginBottom: 20,
  },
  emptyBudgetText: {
    marginTop: 12,
    fontSize: 15,
    color: '#9ca3af',
  },
  budgetCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
    marginBottom: 20,
  },
  mainCircle: {
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    marginBottom: 24,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 15,
    elevation: 5,
  },
  percentageText: {
    fontSize: 48,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  spentText: {
    fontSize: 16,
    color: '#4b5563',
    fontWeight: '600',
    marginBottom: 4,
  },
  budgetText: {
    fontSize: 14,
    color: '#9ca3af',
  },
  progressBarContainer: {
    width: '100%',
    height: 12,
    backgroundColor: '#f3f4f6',
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
    borderRadius: 12,
    marginBottom: 20,
  },
  alertWarning: {
    backgroundColor: '#fef3c7',
  },
  alertCritical: {
    backgroundColor: '#ef4444',
  },
  alertTextWarning: {
    color: '#92400e',
    fontWeight: '600',
    marginLeft: 12,
    flex: 1,
  },
  alertTextCritical: {
    color: '#fff',
    fontWeight: 'bold',
    marginLeft: 12,
    flex: 1,
  },
  editButton: {
    backgroundColor: '#5f3dc4',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 24,
  },
  editButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  categoriesSection: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 16,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: '#9ca3af',
    marginTop: -10,
    marginBottom: 16,
  },
  categoryBudgetActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  noBudgetText: {
    fontSize: 12,
    color: '#9ca3af',
    fontStyle: 'italic',
  },
  catPercentText: {
    fontSize: 12,
    fontWeight: '600',
  },
  setCatBudgetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#5f3dc4' + '15',
  },
  setCatBudgetText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#5f3dc4',
    marginLeft: 4,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  categoryInfo: {
    flex: 1,
  },
  categoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  categoryName: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '500',
  },
  categoryAmount: {
    fontSize: 14,
    color: '#111827',
    fontWeight: 'bold',
  },
  miniProgressBar: {
    height: 6,
    backgroundColor: '#f3f4f6',
    borderRadius: 3,
    overflow: 'hidden',
  },
  miniProgressFill: {
    height: '100%',
    borderRadius: 3,
  },
  mainBudgetCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    marginBottom: 20,
  },
  budgetLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 12,
  },
  budgetInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 12,
    padding: 14,
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  infoText: {
    fontSize: 12,
    color: '#92400e',
    marginLeft: 6,
    flex: 1,
  },
  catName: {
    flex: 1,
    fontSize: 14,
    color: '#374151',
    fontWeight: '500',
  },
  catInput: {
    width: 110,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    textAlign: 'right',
  },
  catWarningText: {
    fontSize: 12,
    color: '#9ca3af',
    fontStyle: 'italic',
    textAlign: 'center',
  },
  saveFormBtn: {
    backgroundColor: '#5f3dc4',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    marginBottom: 10,
  },
  saveFormText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 24,
    width: '85%',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 20,
  },
  input: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 12,
    padding: 16,
    fontSize: 18,
    marginBottom: 24,
    textAlign: 'center',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#f3f4f6',
    marginRight: 8,
  },
  saveButton: {
    backgroundColor: '#5f3dc4',
    marginLeft: 8,
  },
  cancelButtonText: {
    color: '#4b5563',
    fontSize: 16,
    fontWeight: 'bold',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});