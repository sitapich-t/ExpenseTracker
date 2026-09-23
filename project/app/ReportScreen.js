import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { G, Circle, Text as SvgText } from 'react-native-svg';
import { useFocusEffect } from '@react-navigation/native';
import axios from 'axios';
import { COLORS, SHADOWS, THAI_MONTHS } from '../theme';
import ResponsiveWrapper from '../components/ResponsiveWrapper';
import { useAuth } from './context/AuthContext';

const API_URL = 'http://10.0.2.2:3000/api';

// Color palette for mapping categories to colors
const CATEGORY_COLORS = [
  '#7C3AED', '#3B82F6', '#10B981', '#EC4899', '#F59E0B',
  '#EF4444', '#8B5CF6', '#14B8A6', '#F97316', '#6366F1',
];

// Donut Chart Component using react-native-svg
function DonutChart({ segments, centerText }) {
  const size = 110;
  const strokeWidth = 14;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  let cumulativePercent = 0;

  return (
    <View style={styles.donutWrapper}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <G rotation="-90" origin={`${size / 2}, ${size / 2}`}>
          {/* Base background circle */}
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="#F1F5F9"
            strokeWidth={strokeWidth}
            fill="none"
          />
          {/* Slices */}
          {segments.map((slice, index) => {
            const strokeDashoffset = circumference - (circumference * slice.percent) / 100;
            const rotationAngle = (cumulativePercent / 100) * 360;
            cumulativePercent += slice.percent;

            return (
              <G key={index} rotation={rotationAngle} origin={`${size / 2}, ${size / 2}`}>
                <Circle
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  stroke={slice.color}
                  strokeWidth={strokeWidth}
                  strokeDasharray={`${circumference} ${circumference}`}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  fill="none"
                />
              </G>
            );
          })}
        </G>
        {/* Center Text */}
        <SvgText
          x={size / 2}
          y={size / 2 + 5}
          textAnchor="middle"
          fontSize="15"
          fontWeight="bold"
          fill="#1E293B"
        >
          {centerText}
        </SvgText>
      </Svg>
    </View>
  );
}

// Helper: format number to Thai baht string
function formatBaht(num) {
  return '฿' + Number(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Helper: format short baht for donut center
function formatShortBaht(num) {
  if (num >= 1000) {
    return '฿' + (num / 1000).toFixed(1) + 'K';
  }
  return '฿' + Number(num).toFixed(0);
}

// Week mock data matching Figma (fallback)
const weekDataMock = {
  totalExpense: '฿1,245.50',
  comparison: '-12% จากสัปดาห์ก่อน',
  budgetRemaining: '฿4,754.50',
  budgetGoal: 'เป้าหมาย ฿6,000',
  budgetProgress: 0.21, // 21%
  donutCenter: '฿1.2K',
  categories: [
    { name: 'อาหารและเครื่องดื่ม', amount: '฿523.10', percent: 42, color: '#7C3AED' },
    { name: 'การเดินทาง', amount: '฿311.40', percent: 25, color: '#3B82F6' },
    { name: 'อุปกรณ์การเรียน', amount: '฿224.20', percent: 18, color: '#10B981' },
    { name: 'ความบันเทิง', amount: '฿124.50', percent: 10, color: '#EC4899' },
    { name: 'อื่นๆ', amount: '฿62.30', percent: 5, color: '#F59E0B' },
  ],
  trends: [
    { label: 'จ', amount: '฿120', val: 120 },
    { label: 'อ', amount: '฿160', val: 160 },
    { label: 'พ', amount: '฿60', val: 60 },
    { label: 'พฤ', amount: '฿90', val: 90 },
    { label: 'ศ', amount: '฿130', val: 130 },
    { label: 'ส', amount: '฿260', val: 260 },
    { label: 'อา', amount: '฿80', val: 80 },
  ],
  maxTrendVal: 260,
};

// Month mock data matching Figma (fallback)
const monthDataMock = {
  totalExpense: '฿5,420.00',
  comparison: '-5% จากเดือนก่อน',
  budgetRemaining: '฿12,580.00',
  budgetGoal: 'เป้าหมาย ฿18,000',
  budgetProgress: 0.30, // 30%
  donutCenter: '฿5.4K',
  categories: [
    { name: 'อาหารและเครื่องดื่ม', amount: '฿2,059.60', percent: 38, color: '#7C3AED' },
    { name: 'การเดินทาง', amount: '฿1,192.40', percent: 22, color: '#3B82F6' },
    { name: 'อุปกรณ์การเรียน', amount: '฿813.00', percent: 15, color: '#10B981' },
    { name: 'ความบันเทิง', amount: '฿813.00', percent: 15, color: '#EC4899' },
    { name: 'อื่นๆ', amount: '฿542.00', percent: 10, color: '#F59E0B' },
  ],
  trends: [
    { label: 'สัปดาห์ 1', amount: '฿1450', val: 1450 },
    { label: 'สัปดาห์ 2', amount: '฿1820', val: 1820 },
    { label: 'สัปดาห์ 3', amount: '฿1100', val: 1100 },
    { label: 'สัปดาห์ 4', amount: '฿1050', val: 1050 },
  ],
  maxTrendVal: 1820,
};

// Day-of-week labels (Thai, Mon-Sun)
const DAY_LABELS = ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา'];

// Build categories from API byCategory data
function buildCategories(byCategory, totalExpense) {
  if (!byCategory || byCategory.length === 0) return null;

  return byCategory.map((item, index) => {
    const total = parseFloat(item.total) || 0;
    const percent = totalExpense > 0 ? Math.round((total / totalExpense) * 100) : 0;
    return {
      name: item.category || 'อื่นๆ',
      amount: formatBaht(total),
      percent,
      color: CATEGORY_COLORS[index % CATEGORY_COLORS.length],
    };
  });
}

// Build daily trends from API byDay data (for week tab)
function buildDailyTrends(byDay) {
  if (!byDay || byDay.length === 0) return null;

  // Initialize all 7 days with 0
  const dailyTotals = [0, 0, 0, 0, 0, 0, 0]; // Mon=0 ... Sun=6

  byDay.forEach((item) => {
    const dayStr = item.day; // e.g. "2026-09-23"
    if (dayStr) {
      const date = new Date(dayStr);
      let dow = date.getDay(); // 0=Sun, 1=Mon, ...
      // Convert to Mon=0 ... Sun=6
      dow = dow === 0 ? 6 : dow - 1;
      dailyTotals[dow] += parseFloat(item.total) || 0;
    }
  });

  const trends = dailyTotals.map((val, idx) => ({
    label: DAY_LABELS[idx],
    amount: '฿' + Math.round(val),
    val: Math.round(val),
  }));

  const maxTrendVal = Math.max(...trends.map((t) => t.val), 1);
  return { trends, maxTrendVal };
}

// Build weekly trends from API byDay data (for month tab)
function buildWeeklyTrends(byDay) {
  if (!byDay || byDay.length === 0) return null;

  // Aggregate by week number within the month
  const weeklyTotals = [0, 0, 0, 0, 0]; // up to 5 weeks

  byDay.forEach((item) => {
    const dayStr = item.day;
    if (dayStr) {
      const dayOfMonth = new Date(dayStr).getDate();
      const weekIndex = Math.min(Math.floor((dayOfMonth - 1) / 7), 4);
      weeklyTotals[weekIndex] += parseFloat(item.total) || 0;
    }
  });

  // Filter out empty trailing weeks
  let lastNonZero = weeklyTotals.length - 1;
  while (lastNonZero > 0 && weeklyTotals[lastNonZero] === 0) lastNonZero--;
  const activeWeeks = weeklyTotals.slice(0, Math.max(lastNonZero + 1, 4));

  const trends = activeWeeks.map((val, idx) => ({
    label: `สัปดาห์ ${idx + 1}`,
    amount: '฿' + Math.round(val),
    val: Math.round(val),
  }));

  const maxTrendVal = Math.max(...trends.map((t) => t.val), 1);
  return { trends, maxTrendVal };
}

export default function ReportScreen() {
  const { currentUser } = useAuth();

  // Tabs: 'week' or 'month'
  const [activeTab, setActiveTab] = useState('week');
  const [monthIndex, setMonthIndex] = useState(new Date().getMonth()); // current month

  const [weekData, setWeekData] = useState(weekDataMock);
  const [monthData, setMonthData] = useState(monthDataMock);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    if (!currentUser?.id) return;

    setLoading(true);
    try {
      const now = new Date();
      const year = now.getFullYear();

      // Build month string for the selected month (for month tab)
      const selectedMonth = String(monthIndex + 1).padStart(2, '0');
      const monthParam = `${year}-${selectedMonth}`;

      // Build month string for current week (always current month for week tab)
      const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
      const currentMonthParam = `${year}-${currentMonth}`;

      // Fetch summary for week tab (current month), month tab (selected month), and budget
      const [weekSummaryRes, monthSummaryRes, budgetRes] = await Promise.all([
        axios.get(`${API_URL}/summary`, { params: { userId: currentUser.id, month: currentMonthParam } }),
        axios.get(`${API_URL}/summary`, { params: { userId: currentUser.id, month: monthParam } }),
        axios.get(`${API_URL}/budget`, { params: { userId: currentUser.id } }),
      ]);

      const weekSummary = weekSummaryRes.data;
      const monthSummary = monthSummaryRes.data;
      const budgetData = budgetRes.data;

      // Extract budget values
      let monthlyBudget = 0;
      let dailyBudget = 0;
      if (budgetData.success && budgetData.data) {
        monthlyBudget = parseFloat(budgetData.data.monthly_budget) || 0;
        dailyBudget = parseFloat(budgetData.data.daily_budget) || 0;
      }

      // Weekly budget = dailyBudget * 7
      const weeklyBudget = dailyBudget * 7;

      // ---- Build Week Data ----
      if (weekSummary.success && weekSummary.data) {
        const d = weekSummary.data;
        const totalExp = parseFloat(d.totalExpense) || 0;
        const categories = buildCategories(d.byCategory, totalExp);
        const dailyTrends = buildDailyTrends(d.byDay);

        if (categories && categories.length > 0) {
          const budgetRemaining = weeklyBudget > 0 ? weeklyBudget - totalExp : 0;
          const budgetProgress = weeklyBudget > 0 ? Math.min(totalExp / weeklyBudget, 1) : 0;

          setWeekData({
            totalExpense: formatBaht(totalExp),
            comparison: '-12% จากสัปดาห์ก่อน',
            budgetRemaining: formatBaht(Math.max(budgetRemaining, 0)),
            budgetGoal: `เป้าหมาย ${formatBaht(weeklyBudget)}`,
            budgetProgress,
            donutCenter: formatShortBaht(totalExp),
            categories,
            trends: dailyTrends ? dailyTrends.trends : weekDataMock.trends,
            maxTrendVal: dailyTrends ? dailyTrends.maxTrendVal : weekDataMock.maxTrendVal,
          });
        } else {
          setWeekData(weekDataMock);
        }
      } else {
        setWeekData(weekDataMock);
      }

      // ---- Build Month Data ----
      if (monthSummary.success && monthSummary.data) {
        const d = monthSummary.data;
        const totalExp = parseFloat(d.totalExpense) || 0;
        const categories = buildCategories(d.byCategory, totalExp);
        const weeklyTrends = buildWeeklyTrends(d.byDay);

        if (categories && categories.length > 0) {
          const budgetRemaining = monthlyBudget > 0 ? monthlyBudget - totalExp : 0;
          const budgetProgress = monthlyBudget > 0 ? Math.min(totalExp / monthlyBudget, 1) : 0;

          setMonthData({
            totalExpense: formatBaht(totalExp),
            comparison: '-5% จากเดือนก่อน',
            budgetRemaining: formatBaht(Math.max(budgetRemaining, 0)),
            budgetGoal: `เป้าหมาย ${formatBaht(monthlyBudget)}`,
            budgetProgress,
            donutCenter: formatShortBaht(totalExp),
            categories,
            trends: weeklyTrends ? weeklyTrends.trends : monthDataMock.trends,
            maxTrendVal: weeklyTrends ? weeklyTrends.maxTrendVal : monthDataMock.maxTrendVal,
          });
        } else {
          setMonthData(monthDataMock);
        }
      } else {
        setMonthData(monthDataMock);
      }
    } catch (error) {
      console.log('ReportScreen fetch error:', error);
      // Fall back to mock data on error
      setWeekData(weekDataMock);
      setMonthData(monthDataMock);
    } finally {
      setLoading(false);
    }
  }, [currentUser?.id, monthIndex]);

  // Re-fetch on screen focus and when tab/month changes
  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData])
  );

  const currentData = activeTab === 'week' ? weekData : monthData;

  const nextMonth = () => setMonthIndex((prev) => (prev + 1) % 12);
  const prevMonth = () => setMonthIndex((prev) => (prev - 1 + 12) % 12);

  return (
    <ResponsiveWrapper>
      <SafeAreaView style={styles.safeArea}>
        {/* Header Bar */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.avatarCircle}>
              <Ionicons name="person" size={18} color="#6D28D9" />
            </View>
            <Text style={styles.appTitle}>peet Wallet</Text>
          </View>
          <TouchableOpacity 
            style={styles.bellBtn}
            onPress={() => Alert.alert('การแจ้งเตือน', 'ไม่มีการแจ้งเตือนใหม่')}
          >
            <Ionicons name="notifications-outline" size={20} color="#1E293B" />
          </TouchableOpacity>
        </View>

        <ScrollView 
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Screen Title & Month Switcher Row */}
          <View style={styles.titleRow}>
            <Text style={styles.screenTitle}>วิเคราะห์</Text>

            {activeTab === 'month' && (
              <View style={styles.monthPill}>
                <TouchableOpacity onPress={prevMonth} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Ionicons name="chevron-back" size={14} color="#6D28D9" />
                </TouchableOpacity>
                <Text style={styles.monthPillText}>
                  {THAI_MONTHS[monthIndex]} 2026
                </Text>
                <TouchableOpacity onPress={nextMonth} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Ionicons name="chevron-forward" size={14} color="#6D28D9" />
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Underline Tabs: สัปดาห์ | เดือน */}
          <View style={styles.tabBar}>
            <TouchableOpacity 
              style={styles.tabItem}
              onPress={() => setActiveTab('week')}
            >
              <Text style={[styles.tabText, activeTab === 'week' && styles.tabTextActive]}>
                สัปดาห์
              </Text>
              {activeTab === 'week' && <View style={styles.tabIndicator} />}
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.tabItem}
              onPress={() => setActiveTab('month')}
            >
              <Text style={[styles.tabText, activeTab === 'month' && styles.tabTextActive]}>
                เดือน
              </Text>
              {activeTab === 'month' && <View style={styles.tabIndicator} />}
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#6D28D9" />
            </View>
          ) : (
            <>
              {/* Card 1: ยอดใช้จ่ายรวม & งบประมาณคงเหลือ */}
              <View style={styles.card}>
                <Text style={styles.metricLabel}>
                  {activeTab === 'week' ? 'ยอดใช้จ่ายรวมสัปดาห์นี้' : 'ยอดใช้จ่ายรวมเดือนนี้'}
                </Text>
                
                <View style={styles.amountBadgeRow}>
                  <Text style={styles.mainAmount}>{currentData.totalExpense}</Text>
                  <View style={styles.compareBadge}>
                    <Text style={styles.compareText}>{currentData.comparison}</Text>
                  </View>
                </View>

                <View style={styles.divider} />

                <View style={styles.budgetRow}>
                  <Text style={styles.budgetLabel}>งบประมาณคงเหลือ</Text>
                  <Text style={styles.budgetGoal}>{currentData.budgetGoal}</Text>
                </View>

                <Text style={styles.budgetAmount}>{currentData.budgetRemaining}</Text>

                {/* Horizontal Progress Bar */}
                <View style={styles.progressBarTrack}>
                  <View style={[styles.progressBarFill, { width: `${currentData.budgetProgress * 100}%` }]} />
                </View>
              </View>

              {/* Card 2: สัดส่วนการใช้จ่าย (Donut Chart) */}
              <View style={styles.card}>
                <Text style={styles.cardSectionTitle}>
                  {activeTab === 'week' ? 'สัดส่วนการใช้จ่าย' : 'สัดส่วนการใช้จ่ายรายเดือน'}
                </Text>

                <View style={styles.breakdownRow}>
                  {/* Donut Chart */}
                  <DonutChart 
                    segments={currentData.categories} 
                    centerText={currentData.donutCenter} 
                  />

                  {/* Legend List */}
                  <View style={styles.legendContainer}>
                    {currentData.categories.map((cat, idx) => (
                      <View key={idx} style={styles.legendItem}>
                        <View style={[styles.legendDot, { backgroundColor: cat.color }]} />
                        <Text style={styles.legendName} numberOfLines={1}>{cat.name}</Text>
                        <Text style={styles.legendValue}>{cat.amount} ({cat.percent}%)</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </View>

              {/* Card 3: แนวโน้มรายวัน / แนวโน้มรายสัปดาห์ (Bar Chart) */}
              <View style={styles.card}>
                <Text style={styles.cardSectionTitle}>
                  {activeTab === 'week' ? 'แนวโน้มรายวัน' : 'แนวโน้มรายสัปดาห์'}
                </Text>

                <View style={styles.barChartContainer}>
                  {currentData.trends.map((t, idx) => {
                    const barHeightPercent = Math.max(15, (t.val / currentData.maxTrendVal) * 100);
                    return (
                      <View key={idx} style={styles.barCol}>
                        <Text style={styles.barAmountText}>{t.amount}</Text>
                        <View style={styles.barTrack}>
                          <View style={[styles.barFill, { height: `${barHeightPercent}%` }]} />
                        </View>
                        <Text style={styles.barLabel}>{t.label}</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            </>
          )}
        </ScrollView>
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
  avatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F3E8FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  appTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1E293B',
  },
  bellBtn: {
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
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  screenTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1E293B',
  },
  monthPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EDE9FE',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 8,
  },
  monthPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6D28D9',
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    marginBottom: 16,
  },
  tabItem: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    position: 'relative',
  },
  tabText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#94A3B8',
  },
  tabTextActive: {
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
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    ...SHADOWS.small,
  },
  metricLabel: {
    fontSize: 13,
    color: '#64748B',
    marginBottom: 6,
  },
  amountBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 12,
  },
  mainAmount: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  compareBadge: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  compareText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#059669',
  },
  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginBottom: 14,
  },
  budgetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  budgetLabel: {
    fontSize: 13,
    color: '#64748B',
  },
  budgetGoal: {
    fontSize: 12,
    color: '#6D28D9',
    fontWeight: '600',
  },
  budgetAmount: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1E293B',
    marginBottom: 12,
  },
  progressBarTrack: {
    height: 8,
    backgroundColor: '#EDE9FE',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#6D28D9',
    borderRadius: 4,
  },
  cardSectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 16,
  },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  donutWrapper: {
    marginRight: 16,
  },
  legendContainer: {
    flex: 1,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  legendName: {
    fontSize: 12,
    color: '#475569',
    flex: 1,
  },
  legendValue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1E293B',
  },
  barChartContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 160,
    paddingTop: 10,
    paddingBottom: 4,
  },
  barCol: {
    flex: 1,
    alignItems: 'center',
    height: '100%',
    justifyContent: 'flex-end',
  },
  barAmountText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 4,
  },
  barTrack: {
    width: 22,
    height: 100,
    justifyContent: 'flex-end',
    backgroundColor: '#F8FAFC',
    borderRadius: 6,
    overflow: 'hidden',
    marginBottom: 6,
  },
  barFill: {
    width: '100%',
    backgroundColor: '#6D28D9',
    borderRadius: 6,
  },
  barLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  loadingContainer: {
    paddingVertical: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
});