import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  Alert,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { useAuth } from './context/AuthContext';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS, THAI_MONTHS, THAI_MONTHS_SHORT, getCategoryInfo } from '../theme';
import ResponsiveWrapper from '../components/ResponsiveWrapper';

const API_URL = 'http://10.0.2.2:3000/api';

// Thai day-of-week full names for date group headers
const THAI_DAYS_FULL = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];

// Mock data matching Figma design (fallback)
const MOCK_DAY_TRANSACTIONS = [
  { id: '1', title: 'กาแฟ Campus Cafe', categoryName: 'อาหารและเครื่องดื่ม', type: 'expense', amount: 45.0, icon: 'coffee-outline', iconBg: '#FFF7ED', iconColor: '#EA580C' },
  { id: '2', title: 'ค่ารถ BTS', categoryName: 'การเดินทาง', type: 'expense', amount: 35.0, icon: 'train-outline', iconBg: '#EFF6FF', iconColor: '#2563EB' },
  { id: '3', title: 'เงินโอนจากแม่', categoryName: 'รายรับ', type: 'income', amount: 2000.0, icon: 'cash-outline', iconBg: '#ECFDF5', iconColor: '#059669' },
];

const MOCK_WEEK_GROUPS = [
  {
    dateTitle: 'จันทร์ 15 ก.ย. 2026',
    items: [
      { id: 'w1', title: 'กาแฟ Campus Cafe', categoryName: 'อาหารและเครื่องดื่ม', type: 'expense', amount: 45.0, icon: 'coffee-outline', iconBg: '#FFF7ED', iconColor: '#EA580C' },
      { id: 'w2', title: 'ค่ารถ BTS', categoryName: 'การเดินทาง', type: 'expense', amount: 35.0, icon: 'train-outline', iconBg: '#EFF6FF', iconColor: '#2563EB' },
    ],
  },
  {
    dateTitle: 'อาทิตย์ 14 ก.ย. 2026',
    items: [
      { id: 'w3', title: 'เงินโอนจากแม่', categoryName: 'รายรับ', type: 'income', amount: 2000.0, icon: 'cash-outline', iconBg: '#ECFDF5', iconColor: '#059669' },
      { id: 'w4', title: 'มื้อเย็นกับเพื่อน', categoryName: 'อาหารและเครื่องดื่ม', type: 'expense', amount: 480.0, icon: 'restaurant-outline', iconBg: '#FFF7ED', iconColor: '#EA580C' },
    ],
  },
];

const MOCK_MONTH_GROUPS = [
  {
    dateTitle: '15 กันยายน 2026',
    items: [
      { id: 'm1', title: 'กาแฟ Campus Cafe', categoryName: 'อาหารและเครื่องดื่ม', type: 'expense', amount: 45.0, icon: 'coffee-outline', iconBg: '#FFF7ED', iconColor: '#EA580C' },
    ],
  },
  {
    dateTitle: '12 กันยายน 2026',
    items: [
      { id: 'm2', title: 'ค่าหอพัก', categoryName: 'ที่อยู่อาศัย', type: 'expense', amount: 4500.0, icon: 'home-outline', iconBg: '#F5F3FF', iconColor: '#7C3AED' },
    ],
  },
  {
    dateTitle: '10 กันยายน 2026',
    items: [
      { id: 'm3', title: 'เงินเดือนพาร์ทไทม์', categoryName: 'รายรับ', type: 'income', amount: 8500.0, icon: 'cash-outline', iconBg: '#ECFDF5', iconColor: '#059669' },
    ],
  },
];

// Map category id to Ionicons icon name and colors
function getCategoryIcon(category) {
  const mapping = {
    food: { icon: 'restaurant-outline', iconBg: '#FFF7ED', iconColor: '#EA580C' },
    transport: { icon: 'car-outline', iconBg: '#EFF6FF', iconColor: '#2563EB' },
    housing: { icon: 'home-outline', iconBg: '#F5F3FF', iconColor: '#7C3AED' },
    entertainment: { icon: 'game-controller-outline', iconBg: '#FDF2F8', iconColor: '#EC4899' },
    shopping: { icon: 'cart-outline', iconBg: '#F0FDFA', iconColor: '#14B8A6' },
    education: { icon: 'school-outline', iconBg: '#EEF2FF', iconColor: '#6366F1' },
    health: { icon: 'medkit-outline', iconBg: '#F0FDF4', iconColor: '#22C55E' },
    utilities: { icon: 'bulb-outline', iconBg: '#FEFCE8', iconColor: '#EAB308' },
    salary: { icon: 'cash-outline', iconBg: '#ECFDF5', iconColor: '#059669' },
    freelance: { icon: 'laptop-outline', iconBg: '#F5F3FF', iconColor: '#7C3AED' },
    investment: { icon: 'trending-up-outline', iconBg: '#F0F9FF', iconColor: '#0EA5E9' },
    gift: { icon: 'gift-outline', iconBg: '#FFF1F2', iconColor: '#F43F5E' },
    other: { icon: 'ellipsis-horizontal-outline', iconBg: '#F3F4F6', iconColor: '#6B7280' },
  };
  return mapping[category] || mapping.other;
}

// Transform API expense item into UI transaction item
function mapExpenseToTransaction(expense) {
  const catInfo = getCategoryInfo(expense.category);
  const iconInfo = getCategoryIcon(expense.category);
  return {
    id: String(expense.id),
    title: expense.title || expense.note || catInfo.name,
    categoryName: catInfo.name,
    type: expense.type === 'income' ? 'income' : 'expense',
    amount: parseFloat(expense.amount) || 0,
    icon: iconInfo.icon,
    iconBg: iconInfo.iconBg,
    iconColor: iconInfo.iconColor,
    date: expense.date, // keep raw date for grouping
  };
}

export default function HistoryScreen() {
  const navigation = useNavigation();
  const { currentUser } = useAuth();
  const userId = currentUser?.id || 'demo_user';

  // 3 view tabs matching Figma mockup: วัน, สัปดาห์, เดือน
  const [activeTab, setActiveTab] = useState('day'); // 'day', 'week', 'month'
  const [currentMonthIndex, setCurrentMonthIndex] = useState(new Date().getMonth()); // current month
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());

  // State for API data
  const [dayTransactions, setDayTransactions] = useState(MOCK_DAY_TRANSACTIONS);
  const [weekGroups, setWeekGroups] = useState(MOCK_WEEK_GROUPS);
  const [monthGroups, setMonthGroups] = useState(MOCK_MONTH_GROUPS);
  const [totalIncome, setTotalIncome] = useState(0);
  const [totalExpense, setTotalExpense] = useState(0);
  const [balance, setBalance] = useState(0);

  // Helper: format YYYY-MM for API
  const getMonthParam = useCallback((monthIdx, year) => {
    const m = String(monthIdx + 1).padStart(2, '0');
    return `${year}-${m}`;
  }, []);

  // Helper: get today's date string YYYY-MM-DD
  const getTodayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  // Helper: get start of current week (Sunday)
  const getWeekRange = () => {
    const now = new Date();
    const day = now.getDay(); // 0=Sun
    const start = new Date(now);
    start.setDate(now.getDate() - day);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  };

  // Format a date string to Thai group title for week tab: "จันทร์ 15 ก.ย. 2026"
  const formatWeekDateTitle = (dateStr) => {
    const d = new Date(dateStr);
    const dayName = THAI_DAYS_FULL[d.getDay()];
    const dayNum = d.getDate();
    const monthShort = THAI_MONTHS_SHORT[d.getMonth()];
    const year = d.getFullYear();
    return `${dayName} ${dayNum} ${monthShort} ${year}`;
  };

  // Format a date string to Thai group title for month tab: "15 กันยายน 2026"
  const formatMonthDateTitle = (dateStr) => {
    const d = new Date(dateStr);
    const dayNum = d.getDate();
    const monthFull = THAI_MONTHS[d.getMonth()];
    const year = d.getFullYear();
    return `${dayNum} ${monthFull} ${year}`;
  };

  // Group transactions by date string key, return sorted groups (newest first)
  const groupByDate = (transactions, formatFn) => {
    const groups = {};
    transactions.forEach((tx) => {
      const dateStr = tx.date ? tx.date.substring(0, 10) : getTodayStr();
      const title = formatFn(dateStr);
      if (!groups[dateStr]) {
        groups[dateStr] = { dateTitle: title, dateKey: dateStr, items: [] };
      }
      groups[dateStr].items.push(tx);
    });
    // Sort by date descending
    return Object.values(groups).sort((a, b) => b.dateKey.localeCompare(a.dateKey));
  };

  // Fetch data from API
  const fetchData = useCallback(async () => {
    const monthParam = getMonthParam(currentMonthIndex, currentYear);

    try {
      // Fetch expenses for the selected month
      const expRes = await axios.get(`${API_URL}/expenses`, {
        params: { userId, month: monthParam },
      });

      let allExpenses = [];
      if (expRes.data && expRes.data.success && Array.isArray(expRes.data.data) && expRes.data.data.length > 0) {
        allExpenses = expRes.data.data.map(mapExpenseToTransaction);
      }

      // Fetch summary for the selected month
      const sumRes = await axios.get(`${API_URL}/summary`, {
        params: { userId, month: monthParam },
      });

      if (sumRes.data && sumRes.data.success && sumRes.data.data) {
        const s = sumRes.data.data;
        setTotalIncome(parseFloat(s.totalIncome) || 0);
        setTotalExpense(parseFloat(s.totalExpense) || 0);
        setBalance(parseFloat(s.balance) || 0);
      } else {
        // fallback
        setTotalIncome(0);
        setTotalExpense(0);
        setBalance(0);
      }

      if (expRes.data?.success) {
        // --- DAY tab: filter today only ---
        const todayStr = getTodayStr();
        const todayTx = allExpenses.filter((tx) => tx.date && tx.date.substring(0, 10) === todayStr);
        setDayTransactions(todayTx);

        // --- WEEK tab: filter this week, group by date ---
        const { start: weekStart, end: weekEnd } = getWeekRange();
        const weekTx = allExpenses.filter((tx) => {
          if (!tx.date) return false;
          const d = new Date(tx.date);
          return d >= weekStart && d <= weekEnd;
        });
        setWeekGroups(groupByDate(weekTx, formatWeekDateTitle));

        // --- MONTH tab: group all expenses by date ---
        setMonthGroups(groupByDate(allExpenses, formatMonthDateTitle));
      } else {
        // No API data – use mock fallback
        setDayTransactions(MOCK_DAY_TRANSACTIONS);
        setWeekGroups(MOCK_WEEK_GROUPS);
        setMonthGroups(MOCK_MONTH_GROUPS);
      }
    } catch (error) {
      console.log('HistoryScreen fetch error:', error);
      // Keep mock data on error
      setDayTransactions(MOCK_DAY_TRANSACTIONS);
      setWeekGroups(MOCK_WEEK_GROUPS);
      setMonthGroups(MOCK_MONTH_GROUPS);
      setTotalIncome(0);
      setTotalExpense(0);
      setBalance(0);
    }
  }, [userId, currentMonthIndex, currentYear, getMonthParam]);

  // Fetch on focus and when month changes
  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData])
  );

  // Delete transaction handler
  const handleDeleteTransaction = (id) => {
    Alert.alert(
      'ลบรายการ',
      'คุณต้องการลบรายการนี้หรือไม่?',
      [
        { text: 'ยกเลิก', style: 'cancel' },
        {
          text: 'ลบ',
          style: 'destructive',
          onPress: async () => {
            try {
              const res = await axios.delete(`${API_URL}/expenses/${id}`);
              if (res.data && res.data.success) {
                // Re-fetch data after deletion
                fetchData();
              } else {
                Alert.alert('ข้อผิดพลาด', 'ไม่สามารถลบรายการได้');
              }
            } catch (error) {
              console.log('Delete error:', error);
              Alert.alert('ข้อผิดพลาด', 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้');
            }
          },
        },
      ]
    );
  };

  const formatAmount = (num) => {
    return '฿' + Number(num || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const handleNextMonth = () => {
    setCurrentMonthIndex((prev) => {
      if (prev === 11) {
        setCurrentYear((y) => y + 1);
        return 0;
      }
      return prev + 1;
    });
  };

  const handlePrevMonth = () => {
    setCurrentMonthIndex((prev) => {
      if (prev === 0) {
        setCurrentYear((y) => y - 1);
        return 11;
      }
      return prev - 1;
    });
  };

  const renderTransactionCard = (item) => {
    const isIncome = item.type === 'income';
    return (
      <TouchableOpacity
        key={item.id}
        style={styles.transactionCard}
        onLongPress={() => handleDeleteTransaction(item.id)}
        activeOpacity={0.7}
      >
        <View style={[styles.iconBox, { backgroundColor: item.iconBg }]}>
          <Ionicons name={item.icon} size={22} color={item.iconColor} />
        </View>

        <View style={styles.transactionInfo}>
          <Text style={styles.transactionTitle}>{item.title}</Text>
          <Text style={styles.transactionSub}>{item.categoryName}</Text>
        </View>

        <Text style={[styles.transactionAmount, isIncome ? styles.incomeText : styles.expenseText]}>
          {isIncome ? `+${formatAmount(item.amount)}` : `-${formatAmount(item.amount)}`}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <ResponsiveWrapper>
      <SafeAreaView style={styles.safeArea}>
        {/* Top Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.avatarPlaceholder}>
              <Ionicons name="person" size={20} color="#6D28D9" />
            </View>
            <Text style={styles.headerAppTitle}>peet Wallet</Text>
          </View>
          <TouchableOpacity 
            style={styles.bellButton}
            onPress={() => Alert.alert('การแจ้งเตือน', 'ไม่มีการแจ้งเตือนใหม่ในขณะนี้')}
          >
            <Ionicons name="notifications-outline" size={20} color="#1F2937" />
          </TouchableOpacity>
        </View>

        <ScrollView 
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Main Balance Card (Exact Figma match) */}
          <View style={styles.balanceCard}>
            <Text style={styles.balanceLabel}>ยอดคงเหลือปัจจุบัน</Text>
            <Text style={styles.balanceAmount}>{formatAmount(balance)}</Text>

            <View style={styles.chipsRow}>
              {/* Income Chip */}
              <View style={styles.incomeChip}>
                <View style={styles.incomeIconCircle}>
                  <Ionicons name="arrow-down" size={14} color="#10B981" />
                </View>
                <View style={styles.chipTextCol}>
                  <Text style={styles.incomeChipLabel}>รายรับที่เข้ามา</Text>
                  <Text style={styles.incomeChipValue}>{formatAmount(totalIncome)}</Text>
                </View>
              </View>

              {/* Expense Chip */}
              <View style={styles.expenseChip}>
                <View style={styles.expenseIconCircle}>
                  <Ionicons name="arrow-up" size={14} color="#EF4444" />
                </View>
                <View style={styles.chipTextCol}>
                  <Text style={styles.expenseChipLabel}>รายจ่ายทั้งหมด</Text>
                  <Text style={styles.expenseChipValue}>{formatAmount(totalExpense)}</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Underline Tabs: วัน | สัปดาห์ | เดือน */}
          <View style={styles.tabContainer}>
            <TouchableOpacity 
              style={[styles.tabButton, activeTab === 'day' && styles.activeTabButton]}
              onPress={() => setActiveTab('day')}
            >
              <Text style={[styles.tabText, activeTab === 'day' && styles.activeTabText]}>วัน</Text>
              {activeTab === 'day' && <View style={styles.tabIndicator} />}
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.tabButton, activeTab === 'week' && styles.activeTabButton]}
              onPress={() => setActiveTab('week')}
            >
              <Text style={[styles.tabText, activeTab === 'week' && styles.activeTabText]}>สัปดาห์</Text>
              {activeTab === 'week' && <View style={styles.tabIndicator} />}
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.tabButton, activeTab === 'month' && styles.activeTabButton]}
              onPress={() => setActiveTab('month')}
            >
              <Text style={[styles.tabText, activeTab === 'month' && styles.activeTabText]}>เดือน</Text>
              {activeTab === 'month' && <View style={styles.tabIndicator} />}
            </TouchableOpacity>
          </View>

          {/* Tab 1: วัน */}
          {activeTab === 'day' && (
            <View style={styles.tabContent}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>รายการวันนี้</Text>
                <TouchableOpacity onPress={() => Alert.alert('ประวัติทั้งหมด', 'แสดงประวัติรายการทั้งหมด')}>
                  <Text style={styles.seeAllText}>ดูทั้งหมด</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.listCard}>
                {dayTransactions.map((item, idx) => (
                  <React.Fragment key={item.id}>
                    {renderTransactionCard(item)}
                    {idx < dayTransactions.length - 1 && <View style={styles.itemDivider} />}
                  </React.Fragment>
                ))}
              </View>
            </View>
          )}

          {/* Tab 2: สัปดาห์ */}
          {activeTab === 'week' && (
            <View style={styles.tabContent}>
              {weekGroups.map((group) => (
                <View key={group.dateTitle} style={styles.dateGroupContainer}>
                  <Text style={styles.dateGroupTitle}>{group.dateTitle}</Text>
                  <View style={styles.listCard}>
                    {group.items.map((item, idx) => (
                      <React.Fragment key={item.id}>
                        {renderTransactionCard(item)}
                        {idx < group.items.length - 1 && <View style={styles.itemDivider} />}
                      </React.Fragment>
                    ))}
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Tab 3: เดือน */}
          {activeTab === 'month' && (
            <View style={styles.tabContent}>
              {/* Month Selector Bar */}
              <View style={styles.monthSelectorBar}>
                <TouchableOpacity onPress={handlePrevMonth} style={styles.monthNavBtn}>
                  <Ionicons name="chevron-back" size={18} color="#4B5563" />
                </TouchableOpacity>
                <Text style={styles.monthSelectorText}>
                  {THAI_MONTHS[currentMonthIndex]} {currentYear}
                </Text>
                <TouchableOpacity onPress={handleNextMonth} style={styles.monthNavBtn}>
                  <Ionicons name="chevron-forward" size={18} color="#4B5563" />
                </TouchableOpacity>
              </View>

              {monthGroups.map((group) => (
                <View key={group.dateTitle} style={styles.dateGroupContainer}>
                  <Text style={styles.dateGroupTitle}>{group.dateTitle}</Text>
                  <View style={styles.listCard}>
                    {group.items.map((item, idx) => (
                      <React.Fragment key={item.id}>
                        {renderTransactionCard(item)}
                        {idx < group.items.length - 1 && <View style={styles.itemDivider} />}
                      </React.Fragment>
                    ))}
                  </View>
                </View>
              ))}
            </View>
          )}
        </ScrollView>

        {/* Floating Action Button (+) */}
        <TouchableOpacity 
          style={styles.fabButton}
          onPress={() => navigation.navigate('AddExpense')}
          activeOpacity={0.8}
        >
          <Ionicons name="add" size={28} color="#FFFFFF" />
        </TouchableOpacity>
      </SafeAreaView>
    </ResponsiveWrapper>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 10,
    backgroundColor: '#FFFFFF',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F3E8FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  headerAppTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
  },
  bellButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 90,
  },
  balanceCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    ...SHADOWS.small,
  },
  balanceLabel: {
    fontSize: 13,
    color: '#64748B',
    marginBottom: 4,
  },
  balanceAmount: {
    fontSize: 32,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 16,
    letterSpacing: -0.5,
  },
  chipsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  incomeChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#DCFCE7',
  },
  incomeIconCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#DCFCE7',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  expenseChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#FEE2E2',
  },
  expenseIconCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  chipTextCol: {
    flex: 1,
  },
  incomeChipLabel: {
    fontSize: 11,
    color: '#15803D',
    marginBottom: 2,
  },
  incomeChipValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#15803D',
  },
  expenseChipLabel: {
    fontSize: 11,
    color: '#B91C1C',
    marginBottom: 2,
  },
  expenseChipValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#B91C1C',
  },
  tabContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    marginBottom: 16,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    position: 'relative',
  },
  activeTabButton: {},
  tabText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#94A3B8',
  },
  activeTabText: {
    color: '#6D28D9',
    fontWeight: '700',
  },
  tabIndicator: {
    position: 'absolute',
    bottom: -1,
    left: 20,
    right: 20,
    height: 3,
    backgroundColor: '#6D28D9',
    borderRadius: 2,
  },
  tabContent: {
    width: '100%',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
  },
  seeAllText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6D28D9',
  },
  listCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    ...SHADOWS.small,
  },
  transactionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  transactionInfo: {
    flex: 1,
  },
  transactionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 3,
  },
  transactionSub: {
    fontSize: 12,
    color: '#64748B',
  },
  transactionAmount: {
    fontSize: 15,
    fontWeight: '700',
  },
  incomeText: {
    color: '#10B981',
  },
  expenseText: {
    color: '#EF4444',
  },
  itemDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
  },
  dateGroupContainer: {
    marginBottom: 16,
  },
  dateGroupTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  monthSelectorBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  monthNavBtn: {
    padding: 6,
  },
  monthSelectorText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1E293B',
  },
  fabButton: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#1E1B4B',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 6,
  },
});
