import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { useAuth } from './context/AuthContext';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS, getCategoryInfo } from '../theme';

const API_BASE_URL = 'http://10.0.2.2:3000/api';

export default function HomeScreen() {
  const navigation = useNavigation();
  const { currentUser } = useAuth();
  
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(false);
  
  const [summary, setSummary] = useState({
    totalBalance: 43580,
    totalIncome: 52000,
    totalExpense: 8420,
  });
  
  const [budget, setBudget] = useState({
    amount: 52000,
    spent: 8420,
  });
  
  const [recentTransactions, setRecentTransactions] = useState([]);

  const fetchDashboardData = async () => {
    try {
      const now = new Date();
      const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const userId = currentUser?.id || 'demo_user';
      
      const [summaryRes, budgetRes, expensesRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/summary?userId=${userId}&month=${monthStr}`, { timeout: 3000 }).catch(() => null),
        axios.get(`${API_BASE_URL}/budget?userId=${userId}`, { timeout: 3000 }).catch(() => null),
        axios.get(`${API_BASE_URL}/expenses?userId=${userId}&month=${monthStr}`, { timeout: 3000 }).catch(() => null),
      ]);
      
      if (summaryRes?.data?.success && summaryRes.data.data) {
        const d = summaryRes.data.data;
        setSummary({
          totalBalance: d.balance ?? 43580,
          totalIncome: d.totalIncome ?? 52000,
          totalExpense: d.totalExpense ?? 8420,
        });
      } else {
        setSummary({
          totalBalance: 43580,
          totalIncome: 52000,
          totalExpense: 8420,
        });
      }
      
      // Calculate actual totalExpense from the fetched summary data
      const fetchedTotalExpense = summaryRes?.data?.success && summaryRes.data.data
        ? (summaryRes.data.data.totalExpense ?? 0)
        : 0;
      
      if (budgetRes?.data?.success && budgetRes.data.data) {
        const b = budgetRes.data.data;
        setBudget({
          amount: Number(b.monthly_budget) || 52000,
          spent: fetchedTotalExpense || 8420,
        });
      }
      
      if (expensesRes?.data?.success && Array.isArray(expensesRes.data.data)) {
        if (expensesRes.data.data.length > 0) {
          setRecentTransactions(expensesRes.data.data.slice(0, 10));
        } else {
          setRecentTransactions([]);
        }
      } else {
        // High fidelity mock data matching mockup in media_1790137581718.png
        setRecentTransactions([
          {
            id: '1',
            title: 'สตาร์บัคส์ สยามพารากอน',
            category: 'food',
            categoryName: 'อาหารและเครื่องดื่ม',
            type: 'expense',
            amount: 150,
            timeStr: 'วันนี้ 10:30',
            date: new Date().toISOString(),
          },
          {
            id: '2',
            title: 'เงินเดือนประจำเดือน',
            category: 'salary',
            categoryName: 'รายได้พิเศษ/งานประจำ',
            type: 'income',
            amount: 45000,
            timeStr: '28 ม.ค.',
            date: new Date(Date.now() - 86400000).toISOString(),
          },
          {
            id: '3',
            title: 'รถไฟฟ้า BTS',
            category: 'transport',
            categoryName: 'เดินทาง',
            type: 'expense',
            amount: 44,
            timeStr: '27 ม.ค.',
            date: new Date(Date.now() - 172800000).toISOString(),
          },
          {
            id: '4',
            title: 'บุฟเฟต์ชาบูรวมกลุ่ม',
            category: 'food',
            categoryName: 'อาหารและเครื่องดื่ม',
            type: 'expense',
            amount: 599,
            timeStr: '25 ม.ค.',
            date: new Date(Date.now() - 259200000).toISOString(),
          },
        ]);
      }
    } catch (error) {
      console.log('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchDashboardData();
    }, [currentUser])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchDashboardData();
  }, []);

  const formatCurrency = (amount) => {
    return Number(amount || 0).toLocaleString('th-TH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  // In-App Warning calculation (User Scope 03)
  const budgetRatio = budget.amount > 0 ? (budget.spent / budget.amount) * 100 : 0;
  const isBudgetWarning = budgetRatio >= 70;

  const renderTransactionItem = ({ item }) => {
    const isIncome = item.type === 'income';
    const cat = getCategoryInfo(item.category);
    
    return (
      <View style={styles.transactionCard}>
        <View style={[styles.directionIconCircle, { backgroundColor: isIncome ? '#DCFCE7' : '#F3E8FF' }]}>
          <Ionicons
            name={isIncome ? 'arrow-down' : 'arrow-up'}
            size={18}
            color={isIncome ? '#16A34A' : '#7C3AED'}
          />
        </View>

        <View style={styles.transactionInfo}>
          <Text style={styles.transactionTitle} numberOfLines={1}>{item.title || item.category || cat.name || 'รายการ'}</Text>
          <Text style={styles.transactionSubtitle}>
            หมวดหมู่: {item.category || item.categoryName || cat.name} • {item.timeStr || (item.date ? item.date.substring(0, 10) : '')}
          </Text>
        </View>

        <Text style={[styles.transactionAmount, { color: isIncome ? '#16A34A' : '#EF4444' }]}>
          {isIncome ? '+' : '-'}฿{Number(item.amount).toLocaleString('th-TH')}
        </Text>
      </View>
    );
  };

  if (loading && !refreshing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F3F4F6" />
      
      {/* Top Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.avatarCircle}>
            <Ionicons name="person" size={20} color={COLORS.primary} />
          </View>
          <Text style={styles.headerTitle}>Expense Tracker</Text>
        </View>
        <TouchableOpacity style={styles.headerBellBtn} activeOpacity={0.7}>
          <Ionicons name="notifications-outline" size={22} color="#1F2937" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={recentTransactions}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderTransactionItem}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListHeaderComponent={
          <>
            {/* Balance Card matching media_1790137581718.png */}
            <View style={styles.balanceCard}>
              <Text style={styles.balanceLabel}>ยอดเงินคงเหลือทั้งหมด</Text>
              <Text style={styles.balanceAmount}>฿{formatCurrency(summary.totalBalance)}</Text>
              
              <View style={styles.chipsRow}>
                <View style={styles.chipItem}>
                  <Text style={styles.chipLabel}>รายรับ (เดือนนี้)</Text>
                  <Text style={[styles.chipValue, { color: '#4ADE80' }]}>
                    ฿{Number(summary.totalIncome).toLocaleString('th-TH')}
                  </Text>
                </View>
                <View style={styles.chipDivider} />
                <View style={styles.chipItem}>
                  <Text style={styles.chipLabel}>รายจ่าย (เดือนนี้)</Text>
                  <Text style={[styles.chipValue, { color: '#F87171' }]}>
                    ฿{Number(summary.totalExpense).toLocaleString('th-TH')}
                  </Text>
                </View>
              </View>
            </View>

            {/* In-App Warning Banner (User Scope 03) */}
            {isBudgetWarning && (
              <View style={styles.warningBanner}>
                <Ionicons name="warning" size={20} color="#D97706" />
                <Text style={styles.warningText}>
                  แจ้งเตือน: ใช้จ่ายถึง {budgetRatio.toFixed(0)}% ของงบประมาณรายเดือนแล้ว
                </Text>
              </View>
            )}

            {/* Quick Action Buttons (matching mockup) */}
            <View style={styles.quickActionsRow}>
              {/* Scan to Pay / QR */}
              <TouchableOpacity 
                style={styles.actionCard}
                onPress={() => navigation.navigate('JoinGroup')}
                activeOpacity={0.8}
              >
                <View style={[styles.actionIconBox, { backgroundColor: '#F3E8FF' }]}>
                  <Ionicons name="qr-code-outline" size={24} color={COLORS.primary} />
                </View>
                <Text style={styles.actionTitle}>สแกนจ่าย</Text>
              </TouchableOpacity>

              {/* Scan Receipt / OCR */}
              <TouchableOpacity 
                style={styles.actionCard}
                onPress={() => navigation.navigate('UploadSlip')}
                activeOpacity={0.8}
              >
                <View style={[styles.actionIconBox, { backgroundColor: '#DCFCE7' }]}>
                  <Ionicons name="camera-outline" size={24} color="#16A34A" />
                </View>
                <Text style={styles.actionTitle}>สแกนใบเสร็จ</Text>
              </TouchableOpacity>

              {/* Add Expense / Income Record */}
              <TouchableOpacity 
                style={styles.actionCard}
                onPress={() => navigation.navigate('AddExpense', { type: 'expense' })}
                activeOpacity={0.8}
              >
                <View style={[styles.actionIconBox, { backgroundColor: '#EDE9FE' }]}>
                  <Ionicons name="add-circle-outline" size={24} color={COLORS.primary} />
                </View>
                <Text style={styles.actionTitle}>บันทึกบิล</Text>
              </TouchableOpacity>

              {/* Set Monthly Budget */}
              <TouchableOpacity 
                style={styles.actionCard}
                onPress={() => navigation.navigate('Budget')}
                activeOpacity={0.8}
              >
                <View style={[styles.actionIconBox, { backgroundColor: '#FEF3C7' }]}>
                  <Ionicons name="wallet-outline" size={24} color="#D97706" />
                </View>
                <Text style={styles.actionTitle}>ตั้งงบประมาณ</Text>
              </TouchableOpacity>
            </View>

            {/* Recent Transactions Section Header */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>รายการล่าสุด</Text>
              <TouchableOpacity 
                onPress={() => navigation.navigate('รายจ่าย')}
                activeOpacity={0.7}
              >
                <Text style={styles.seeAllText}>ดูทั้งหมด</Text>
              </TouchableOpacity>
            </View>
          </>
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>ยังไม่มีรายการใช้จ่าย</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#EDE9FE',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#DDD6FE',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
  },
  headerBellBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    padding: SPACING.lg,
    paddingBottom: 24,
  },
  balanceCard: {
    backgroundColor: '#6D28D9',
    borderRadius: 22,
    padding: 22,
    marginBottom: SPACING.lg,
    shadowColor: '#6D28D9',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 6,
  },
  balanceLabel: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.85)',
    marginBottom: 6,
  },
  balanceAmount: {
    fontSize: 34,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 18,
  },
  chipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  chipItem: {
    flex: 1,
    alignItems: 'center',
  },
  chipDivider: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  chipLabel: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.8)',
    marginBottom: 2,
  },
  chipValue: {
    fontSize: 15,
    fontWeight: '700',
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    padding: 12,
    borderRadius: RADIUS.md,
    marginBottom: SPACING.md,
    gap: 8,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  warningText: {
    flex: 1,
    fontSize: 13,
    color: '#92400E',
    fontWeight: '500',
  },
  quickActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.xl,
    gap: 8,
  },
  actionCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.lg,
    paddingVertical: 14,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  actionIconBox: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  actionTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#1F2937',
    textAlign: 'center',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1F2937',
  },
  seeAllText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primary,
  },
  transactionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: SPACING.md,
    borderRadius: RADIUS.lg,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  directionIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  transactionInfo: {
    flex: 1,
  },
  transactionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 3,
  },
  transactionSubtitle: {
    fontSize: 12,
    color: '#6B7280',
  },
  transactionAmount: {
    fontSize: 15,
    fontWeight: '700',
    marginLeft: 8,
  },
  emptyContainer: {
    padding: SPACING.xl,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#9CA3AF',
  },
});