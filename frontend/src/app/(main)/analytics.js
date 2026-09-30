import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Svg, { G, Circle, Text as SvgText } from 'react-native-svg';
import { useFocusEffect } from 'expo-router';
import { getToken, http } from '@/lib/api';
import { SHADOWS, THAI_MONTHS } from '@/lib/theme';
import {
  startOfWeek,
  buildPeriod,
  buildDailyTrends,
  buildWeeklyTrends,
  emptyPeriod,
} from '@/lib/analyticsUtils';

// Donut Chart Component using react-native-svg
function DonutChart({ segments, centerText }) {
  const size = 110;
  const strokeWidth = 14;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  // คำนวณตำแหน่งเริ่มต้นของแต่ละชิ้นไว้ก่อน (ห้าม mutate ตัวแปรระหว่าง render)
  const percents = segments.map((s) => s.percent);
  const startPercents = percents.map((_, i) =>
    percents.slice(0, i).reduce((a, b) => a + b, 0)
  );

  return (
    <View style={styles.donutWrapper}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <G rotation="-90" origin={`${size / 2}, ${size / 2}`}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="#F1F5F9"
            strokeWidth={strokeWidth}
            fill="none"
          />
          {segments.map((slice, index) => {
            const strokeDashoffset = circumference - (circumference * slice.percent) / 100;
            const rotationAngle = (startPercents[index] / 100) * 360;

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

const BADGE_COLORS = {
  up: { bg: '#FEF2F2', text: '#DC2626' },
  down: { bg: '#ECFDF5', text: '#059669' },
  flat: { bg: '#F1F5F9', text: '#64748B' },
};

const HIT_SLOP = { top: 10, bottom: 10, left: 10, right: 10 };

const TABS = [
  { key: 'week', label: 'สัปดาห์' },
  { key: 'month', label: 'เดือน' },
];

export default function ReportScreen() {
  // Tabs: 'week' | 'month'
  const [activeTab, setActiveTab] = useState('week');
  const [year, setYear] = useState(new Date().getFullYear());
  const [monthIndex, setMonthIndex] = useState(new Date().getMonth());

  const [weekData, setWeekData] = useState(emptyPeriod);
  const [monthData, setMonthData] = useState(emptyPeriod);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) {
        setWeekData(emptyPeriod);
        setMonthData(emptyPeriod);
        return;
      }

      const authHeaders = { Authorization: `Bearer ${token}` };
      const now = new Date();

      const [txRes, budgetRes] = await Promise.all([
        http.get('/personal/transactions', { headers: authHeaders }),
        http.get(
          `/personal/budgets?month=${now.getMonth() + 1}&year=${now.getFullYear()}`,
          { headers: authHeaders }
        ),
      ]);

      const transactions = txRes.data?.transactions || [];
      const budgets = budgetRes.data?.budgets || [];

      // งบรวม = budget ที่ category_id เป็น null
      const overall = budgets.find((b) => b.category_id === null || b.category_id === undefined);
      const monthlyBudget = overall ? parseFloat(overall.monthly_limit) || 0 : 0;

      // ---- สัปดาห์นี้ ----
      const weekStart = startOfWeek(now);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);
      const prevWeekStart = new Date(weekStart);
      prevWeekStart.setDate(prevWeekStart.getDate() - 7);

      const weeklyBudget = monthlyBudget > 0 ? monthlyBudget / 4 : 0;

      setWeekData(
        buildPeriod({
          transactions,
          start: weekStart,
          end: weekEnd,
          previousStart: prevWeekStart,
          previousEnd: weekStart,
          budgetLimit: weeklyBudget,
          trends: buildDailyTrends(transactions, weekStart, weekEnd),
        })
      );

      // ---- เดือนที่เลือก ----
      const monthStart = new Date(year, monthIndex, 1);
      const monthEnd = new Date(year, monthIndex + 1, 1);
      const prevMonthStart = new Date(year, monthIndex - 1, 1);
      const prevMonthEnd = new Date(year, monthIndex, 1);

      setMonthData(
        buildPeriod({
          transactions,
          start: monthStart,
          end: monthEnd,
          previousStart: prevMonthStart,
          previousEnd: prevMonthEnd,
          budgetLimit: monthlyBudget,
          trends: buildWeeklyTrends(transactions, monthStart, monthEnd),
        })
      );
    } catch (error) {
      console.log('ReportScreen fetch error:', error);
      setWeekData(emptyPeriod);
      setMonthData(emptyPeriod);
    } finally {
      setLoading(false);
    }
  }, [year, monthIndex]);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData])
  );

  const currentData = activeTab === 'week' ? weekData : monthData;
  const badge = BADGE_COLORS[currentData.comparisonDirection] || BADGE_COLORS.flat;

  const TITLES = {
    week: { total: 'ยอดใช้จ่ายรวมสัปดาห์นี้', donut: 'สัดส่วนการใช้จ่าย', trend: 'แนวโน้มรายวัน' },
    month: { total: 'ยอดใช้จ่ายรวมเดือนนี้', donut: 'สัดส่วนการใช้จ่ายรายเดือน', trend: 'แนวโน้มรายสัปดาห์' },
  };
  const titles = TITLES[activeTab];

  const nextMonth = () => {
    if (monthIndex === 11) {
      setMonthIndex(0);
      setYear((y) => y + 1);
    } else {
      setMonthIndex((prev) => prev + 1);
    }
  };
  const prevMonth = () => {
    if (monthIndex === 0) {
      setMonthIndex(11);
      setYear((y) => y - 1);
    } else {
      setMonthIndex((prev) => prev - 1);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header Bar */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.avatarCircle}>
            <Ionicons name="person" size={18} color="#6D28D9" />
          </View>
          <Text style={styles.appTitle}>Personal Analytics</Text>
        </View>
        <TouchableOpacity
          style={styles.bellBtn}
          onPress={() => Alert.alert('การแจ้งเตือน', 'ไม่มีการแจ้งเตือนใหม่')}
        >
          <Ionicons name="notifications-outline" size={20} color="#1E293B" />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Title + ตัวเลื่อนเดือน/ปี */}
        <View style={styles.titleRow}>
          <Text style={styles.screenTitle}>วิเคราะห์</Text>

          {activeTab === 'month' && (
            <View style={styles.monthPill}>
              <TouchableOpacity onPress={prevMonth} hitSlop={HIT_SLOP}>
                <Ionicons name="chevron-back" size={14} color="#6D28D9" />
              </TouchableOpacity>
              <Text style={styles.monthPillText}>
                {THAI_MONTHS[monthIndex]} {year + 543}
              </Text>
              <TouchableOpacity onPress={nextMonth} hitSlop={HIT_SLOP}>
                <Ionicons name="chevron-forward" size={14} color="#6D28D9" />
              </TouchableOpacity>
            </View>
          )}

        </View>

        {/* Tabs: สัปดาห์ | เดือน | ปี */}
        <View style={styles.tabBar}>
          {TABS.map((tab) => (
            <TouchableOpacity
              key={tab.key}
              style={styles.tabItem}
              onPress={() => setActiveTab(tab.key)}
            >
              <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
                {tab.label}
              </Text>
              {activeTab === tab.key && <View style={styles.tabIndicator} />}
            </TouchableOpacity>
          ))}
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#6D28D9" />
          </View>
        ) : (
          <>
            {/* Card 1: ยอดรวม & งบประมาณ */}
            <View style={styles.card}>
              <Text style={styles.metricLabel}>{titles.total}</Text>

              <View style={styles.amountBadgeRow}>
                <Text style={styles.mainAmount}>{currentData.totalExpense}</Text>
                {!!currentData.comparison && (
                  <View style={[styles.compareBadge, { backgroundColor: badge.bg }]}>
                    <Text style={[styles.compareText, { color: badge.text }]}>
                      {currentData.comparison}
                    </Text>
                  </View>
                )}
              </View>

              <>
                  <View style={styles.divider} />
                  <View style={styles.budgetRow}>
                    <Text style={styles.budgetLabel}>งบประมาณคงเหลือ</Text>
                    <Text style={styles.budgetGoal}>{currentData.budgetGoal}</Text>
                  </View>
                  <Text style={styles.budgetAmount}>{currentData.budgetRemaining}</Text>
                  <View style={styles.progressBarTrack}>
                    <View
                      style={[styles.progressBarFill, { width: `${currentData.budgetProgress * 100}%` }]}
                    />
                  </View>
              </>
            </View>

            {/* Card 2: โดนัท */}
            <View style={styles.card}>
              <Text style={styles.cardSectionTitle}>{titles.donut}</Text>
              <View style={styles.breakdownRow}>
                <DonutChart segments={currentData.categories} centerText={currentData.donutCenter} />
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

            {/* Card 3: แท่ง */}
            <View style={styles.card}>
              <Text style={styles.cardSectionTitle}>{titles.trend}</Text>
              <View style={styles.barChartContainer}>
                {currentData.trends.map((t, idx) => {
                  const barHeightPercent = t.val > 0 ? Math.max(8, (t.val / currentData.maxTrendVal) * 100) : 0;
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
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 10,
    backgroundColor: '#FFFFFF',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center' },
  avatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F3E8FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  appTitle: { fontSize: 18, fontWeight: '700', color: '#1E293B' },
  bellBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 90 },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  screenTitle: { fontSize: 20, fontWeight: '800', color: '#1E293B' },
  monthPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EDE9FE',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 8,
  },
  monthPillText: { fontSize: 12, fontWeight: '700', color: '#6D28D9' },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    marginBottom: 16,
  },
  tabItem: { flex: 1, paddingVertical: 12, alignItems: 'center', position: 'relative' },
  tabText: { fontSize: 15, fontWeight: '600', color: '#94A3B8' },
  tabTextActive: { color: '#6D28D9', fontWeight: '700' },
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
  metricLabel: { fontSize: 13, color: '#64748B', marginBottom: 6 },
  amountBadgeRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 12 },
  mainAmount: { fontSize: 28, fontWeight: '800', color: '#0F172A', letterSpacing: -0.5 },
  compareBadge: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  compareText: { fontSize: 12, fontWeight: '600', color: '#059669' },
  divider: { height: 1, backgroundColor: '#F1F5F9', marginBottom: 14 },
  budgetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  budgetLabel: { fontSize: 13, color: '#64748B' },
  budgetGoal: { fontSize: 12, color: '#6D28D9', fontWeight: '600' },
  budgetAmount: { fontSize: 22, fontWeight: '800', color: '#1E293B', marginBottom: 12 },
  progressBarTrack: {
    height: 8,
    backgroundColor: '#EDE9FE',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: { height: '100%', backgroundColor: '#6D28D9', borderRadius: 4 },
  cardSectionTitle: { fontSize: 15, fontWeight: '700', color: '#1E293B', marginBottom: 16 },
  breakdownRow: { flexDirection: 'row', alignItems: 'center' },
  donutWrapper: { marginRight: 16 },
  legendContainer: { flex: 1 },
  legendItem: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  legendDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  legendName: { fontSize: 12, color: '#475569', flex: 1 },
  legendValue: { fontSize: 12, fontWeight: '600', color: '#1E293B' },
  barChartContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 160,
    paddingTop: 10,
    paddingBottom: 4,
  },
  barCol: { flex: 1, alignItems: 'center', height: '100%', justifyContent: 'flex-end' },
  barAmountText: { fontSize: 9, fontWeight: '700', color: '#64748B', marginBottom: 4 },
  barTrack: {
    width: 22,
    height: 100,
    justifyContent: 'flex-end',
    backgroundColor: '#F8FAFC',
    borderRadius: 6,
    overflow: 'hidden',
    marginBottom: 6,
  },
  barFill: { width: '100%', backgroundColor: '#6D28D9', borderRadius: 6 },
  barLabel: { fontSize: 11, color: '#64748B', fontWeight: '600' },
  loadingContainer: { paddingVertical: 60, alignItems: 'center', justifyContent: 'center' },
});