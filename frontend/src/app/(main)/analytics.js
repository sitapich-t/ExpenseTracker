import React, { useState, useCallback } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal, TextInput, Alert, ActivityIndicator
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { getToken, http } from '@/lib/api';
import { Ionicons } from '@expo/vector-icons';

const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
];

const CATEGORY_ICONS = {
  Food: { icon: 'fast-food', color: '#f59e0b', name: 'อาหาร' },
  Transport: { icon: 'car', color: '#3b82f6', name: 'เดินทาง' },
  Shopping: { icon: 'cart', color: '#ec4899', name: 'ช้อปปิ้ง' },
  Study: { icon: 'book', color: '#8b5cf6', name: 'การศึกษา' },
  Entertainment: { icon: 'game-controller', color: '#10b981', name: 'บันเทิง' },
  Health: { icon: 'medkit', color: '#ef4444', name: 'สุขภาพ' },
  Bills: { icon: 'receipt', color: '#64748b', name: 'บิลต่างๆ' },
  Other: { icon: 'ellipsis-horizontal-circle', color: '#94a3b8', name: 'อื่นๆ' }
};

export default function AnalyticScreen() {
  // ไม่มีงบ = null (ต่างจาก 0) เพื่อแยกกรณี "ยังไม่เคยตั้งงบ" ออกจาก "ตั้งงบเป็น 0"
  const [budgetId, setBudgetId] = useState(null);
  const [budget, setBudgetAmount] = useState(0);
  const [hasBudget, setHasBudget] = useState(false);
  const [spent, setSpent] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isModalVisible, setModalVisible] = useState(false);
  const [tempBudget, setTempBudget] = useState('');
  const [categoryBreakdown, setCategoryBreakdown] = useState({});

  const currentDate = new Date();
  const currentMonth = currentDate.getMonth(); // 0-indexed สำหรับ THAI_MONTHS
  const currentYear = currentDate.getFullYear();

  const fetchBudgetData = async () => {
    try {
      setLoading(true);

      const token = await getToken();
      if (!token) {
        setLoading(false);
        return;
      }

      const authHeader = { headers: { Authorization: `Bearer ${token}` } };

      // ดึงงบประมาณ "รวม" ของเดือนนี้จาก backend จริง (ไม่ใช้ AsyncStorage อีกต่อไป)
      const budgetRes = await http.get(
        `/personal/budgets?month=${currentMonth + 1}&year=${currentYear}`,
        authHeader
      );
      const budgets = budgetRes.data.budgets || [];
      // งบรวมคือแถวที่ category_id เป็น null (แยกจากงบเฉพาะหมวด)
      const overallBudget = budgets.find(b => b.category_id === null);

      if (overallBudget) {
        setBudgetId(overallBudget.id);
        setBudgetAmount(parseFloat(overallBudget.monthly_limit));
        setHasBudget(true);
      } else {
        setBudgetId(null);
        setBudgetAmount(0);
        setHasBudget(false);
      }

      const response = await http.get('/personal/transactions', authHeader);
      const transactions = response.data.transactions;

      let totalSpent = 0;
      const breakdown = {};

      transactions.forEach(tx => {
        const txDate = new Date(tx.transaction_date || tx.created_at);
        if (
          tx.type === 'expense' &&
          txDate.getMonth() === currentMonth &&
          txDate.getFullYear() === currentYear
        ) {
          const amount = parseFloat(tx.amount);
          totalSpent += amount;

          const cat = tx.categories?.name || tx.category || 'Other';
          if (!breakdown[cat]) {
            breakdown[cat] = 0;
          }
          breakdown[cat] += amount;
        }
      });

      setSpent(totalSpent);
      setCategoryBreakdown(breakdown);
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
      const payload = {
        monthly_limit: parseFloat(tempBudget),
        month: currentMonth + 1,
        year: currentYear,
        // ไม่ส่ง category_id = งบรวมทั้งเดือน
      };

      let res;
      if (budgetId) {
        // มีงบอยู่แล้ว → แก้ไขด้วย PUT
        res = await http.put(`/personal/budgets/${budgetId}`, payload, authHeader);
      } else {
        // ยังไม่มีงบ → ตั้งใหม่ด้วย POST (backend upsert ให้อยู่แล้วถ้าซ้ำเดือน/ปี)
        res = await http.post('/personal/budgets', payload, authHeader);
      }

      const savedBudget = res.data.budget;
      setBudgetId(savedBudget.id);
      setBudgetAmount(parseFloat(savedBudget.monthly_limit));
      setHasBudget(true);
      setModalVisible(false);
      setTempBudget('');

      // backend คืน budgetAlert มาถ้าข้าม threshold ทันทีหลังตั้งงบใหม่ (เช่น ลดวงเงินจนเกิน)
      const alert = res.data.budgetAlert;
      if (alert?.level === 'OVER') {
        Alert.alert('⚠️ เกินงบประมาณ', `คุณใช้จ่ายไปแล้ว ${(alert.percentUsed * 100).toFixed(0)}% ของงบที่ตั้งไว้`);
      } else if (alert?.level === 'WARNING') {
        Alert.alert('⚠️ ใกล้เต็มงบ', `คุณใช้จ่ายไปแล้ว ${(alert.percentUsed * 100).toFixed(0)}% ของงบที่ตั้งไว้`);
      }
    } catch (error) {
      console.error('Error saving budget:', error);
      Alert.alert('ข้อผิดพลาด', 'ไม่สามารถบันทึกงบประมาณได้');
    } finally {
      setSaving(false);
    }
  };

  const percentage = budget > 0 ? (spent / budget) * 100 : 0;
  const clampedPercentage = Math.min(percentage, 100);
  
  let statusColor = '#10b981'; // Green
  if (percentage >= 100) statusColor = '#ef4444'; // Red
  else if (percentage >= 80) statusColor = '#f59e0b'; // Orange (ให้ตรงกับ threshold 80% ที่ backend ใช้)

  const formatMoney = (amount) => {
    return '฿' + amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#5f3dc4" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>งบประมาณรายเดือน</Text>
        <Text style={styles.headerDate}>{THAI_MONTHS[currentMonth]} {currentYear}</Text>
      </View>

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
          setTempBudget(hasBudget ? budget.toString() : '');
          setModalVisible(true);
        }}
      >
        <Ionicons name="create-outline" size={20} color="#fff" />
        <Text style={styles.editButtonText}>ตั้งค่างบประมาณ</Text>
      </TouchableOpacity>

      <View style={styles.categoriesSection}>
        <Text style={styles.sectionTitle}>รายละเอียดตามหมวดหมู่</Text>
        
        {Object.keys(CATEGORY_ICONS).map(catKey => {
          const amount = categoryBreakdown[catKey] || 0;
          if (amount === 0) return null;
          
          const catInfo = CATEGORY_ICONS[catKey];
          const catPercentage = budget > 0 ? Math.min((amount / budget) * 100, 100) : 0;

          return (
            <View key={catKey} style={styles.categoryRow}>
              <View style={[styles.iconContainer, { backgroundColor: catInfo.color + '20' }]}>
                <Ionicons name={catInfo.icon} size={20} color={catInfo.color} />
              </View>
              <View style={styles.categoryInfo}>
                <View style={styles.categoryHeader}>
                  <Text style={styles.categoryName}>{catInfo.name}</Text>
                  <Text style={styles.categoryAmount}>{formatMoney(amount)}</Text>
                </View>
                <View style={styles.miniProgressBar}>
                  <View style={[styles.miniProgressFill, { width: `${catPercentage}%`, backgroundColor: catInfo.color }]} />
                </View>
              </View>
            </View>
          );
        })}

        {Object.keys(categoryBreakdown).length === 0 && (
          <Text style={styles.emptyText}>ยังไม่มีรายการใช้จ่ายในเดือนนี้</Text>
        )}
      </View>

      <Modal
        animationType="slide"
        transparent={true}
        visible={isModalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>ตั้งค่างบประมาณ</Text>
            <Text style={styles.modalSubtitle}>ระบุงบประมาณสำหรับเดือน {THAI_MONTHS[currentMonth]}</Text>
            
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fcfbfe',
  },
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
    marginBottom: 24,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 4,
  },
  headerDate: {
    fontSize: 16,
    color: '#6b7280',
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
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 16,
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
  emptyText: {
    textAlign: 'center',
    color: '#6b7280',
    fontStyle: 'italic',
    paddingVertical: 20,
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
  }
});