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

  // คำนวณตำแหน่งเริ่มต้นของแต่ละชิ้นไว้ก่อน (ห้าม mutate ตัวแปรระหว่าง render)
  const percents = segments.map((s) => s.percent);
  const startPercents = percents.map((_, i) =>
    percents.slice(0, i).reduce((a, b) => a + b, 0)
  );

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

// Day-of-week labels (Thai, Mon-Sun)
const DAY_LABELS = ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา'];

// วันที่ของ transaction (ใช้ transaction_date ก่อน เพราะ created_at เป็น UTC)
const txDate = (t) => new Date(t.transaction_date || t.created_at);

// ต้นสัปดาห์ = วันจันทร์ 00:00
const startOfWeek = (d) => {
  const x = new Date(d);
  const dow = (x.getDay() + 6) % 7; // Mon=0 ... Sun=6
  x.setDate(x.getDate() - dow);
  x.setHours(0, 0, 0, 0);
  return x;
};

const isExpense = (t) => t.type !== 'income';

// ชื่อหมวดหมู่จาก relation ที่ backend join มาให้ (fallback ถ้าไม่มี)
const categoryNameOf = (t) => t.categories?.name || 'อื่นๆ';

// ผลรวมรายจ่ายในช่วง [start, end)
function totalExpenseBetween(transactions, start, end) {
  return transactions
    .filter((t) => {
      const d = txDate(t);
      return !isNaN(d) && d >= start && d < end;
    })
    .filter(isExpense)
    .reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0);
}

// เปอร์เซ็นต์เปลี่ยนแปลงเทียบกับช่วงก่อนหน้า
function comparisonText(current, previous) {
  if (previous <= 0) return current > 0 ? 'ช่วงใหม่' : 'เท่ากับช่วงก่อน';
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return 'เท่ากับช่วงก่อน';
  return `${pct > 0 ? '+' : ''}${pct}% จากช่วงก่อน`;
}

// สัดส่วนการใช้จ่ายรายหมวด (เรียงจากมากไปน้อย)
function buildCategoryBreakdown(transactions, start, end) {
  const byCat = {};
  transactions
    .filter((t) => {
      const d = txDate(t);
      return !isNaN(d) && d >= start && d < end;
    })
    .filter(isExpense)
    .forEach((t) => {
      const key = t.categories?.id ?? t.category_id ?? 9;
      if (!byCat[key]) byCat[key] = { name: categoryNameOf(t), total: 0 };
      byCat[key].total += parseFloat(t.amount) || 0;
    });

  const rows = Object.values(byCat).sort((a, b) => b.total - a.total);
  const total = rows.reduce((s, r) => s + r.total, 0);

  return rows.map((r, i) => ({
    name: r.name,
    amount: formatBaht(r.total),
    percent: total > 0 ? Math.round((r.total / total) * 100) : 0,
    color: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
  }));
}

// แนวโน้มรายวันของสัปดาห์ (จ น พ พฤ ศ ส อา)
function buildDailyTrends(transactions, start, end) {
  const dailyTotals = [0, 0, 0, 0, 0, 0, 0]; // Mon=0 ... Sun=6

  transactions
    .filter((t) => {
      const d = txDate(t);
      return !isNaN(d) && d >= start && d < end;
    })
    .filter(isExpense)
    .forEach((t) => {
      const dow = txDate(t).getDay();
      dailyTotals[dow === 0 ? 6 : dow - 1] += parseFloat(t.amount) || 0;
    });

  const trends = dailyTotals.map((val, idx) => ({
    label: DAY_LABELS[idx],
    amount: '฿' + Math.round(val),
    val: Math.round(val),
  }));

  return { trends, maxTrendVal: Math.max(...trends.map((t) => t.val), 1) };
}

// แนวโน้มรายสัปดาห์ของเดือน
function buildWeeklyTrends(transactions, start, end) {
  const weeklyTotals = [0, 0, 0, 0, 0]; // สูงสุด 5 สัปดาห์

  transactions
    .filter((t) => {
      const d = txDate(t);
      return !isNaN(d) && d >= start && d < end;
    })
    .filter(isExpense)
    .forEach((t) => {
      const weekIndex = Math.min(Math.floor((txDate(t).getDate() - 1) / 7), 4);
      weeklyTotals[weekIndex] += parseFloat(t.amount) || 0;
    });

  let lastNonZero = weeklyTotals.length - 1;
  while (lastNonZero > 0 && weeklyTotals[lastNonZero] === 0) lastNonZero--;
  const activeWeeks = weeklyTotals.slice(0, Math.max(lastNonZero + 1, 4));

  const trends = activeWeeks.map((val, idx) => ({
    label: `สัปดาห์ ${idx + 1}`,
    amount: '฿' + Math.round(val),
    val: Math.round(val),
  }));

  return { trends, maxTrendVal: Math.max(...trends.map((t) => t.val), 1) };
}

// ประกอบข้อมูลทั้งหมดสำหรับ 1 ช่วงเวลา
function buildPeriod({ transactions, start, end, previousStart, previousEnd, budgetLimit, trends }) {
  const totalExpense = totalExpenseBetween(transactions, start, end);
  const previousTotal = totalExpenseBetween(transactions, previousStart, previousEnd);
  const budgetRemaining = budgetLimit > 0 ? budgetLimit - totalExpense : 0;

  return {
    totalExpense: formatBaht(totalExpense),
    comparison: comparisonText(totalExpense, previousTotal),
    budgetRemaining: formatBaht(Math.max(budgetRemaining, 0)),
    budgetGoal: budgetLimit > 0 ? `เป้าหมาย ${formatBaht(budgetLimit)}` : 'ยังไม่ได้ตั้งงบ',
    budgetProgress: budgetLimit > 0 ? Math.min(totalExpense / budgetLimit, 1) : 0,
    donutCenter: formatShortBaht(totalExpense),
    categories: buildCategoryBreakdown(transactions, start, end),
    trends: trends.trends,
    maxTrendVal: trends.maxTrendVal,
  };
}

// ค่าเริ่มต้นตอนยังไม่มีข้อมูล — ไม่ใช้ตัวเลขปลอม
const emptyPeriod = {
  totalExpense: formatBaht(0),
  comparison: '',
  budgetRemaining: formatBaht(0),
  budgetGoal: 'ยังไม่ได้ตั้งงบ',
  budgetProgress: 0,
  donutCenter: formatBaht(0),
  categories: [],
  trends: [],
  maxTrendVal: 1,
};

export default function ReportScreen() {
  // Tabs: 'week' or 'month'
  const [activeTab, setActiveTab] = useState('week');
  const [year, setYear] = useState(new Date().getFullYear());
  const [monthIndex, setMonthIndex] = useState(new Date().getMonth()); // current month

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

      // ดึงรายการทั้งหมด แล้วคำนวณเองฝั่ง client
      // (backend ไม่มี endpoint /summary หรือ /budget แบบ MySQL เดิม)
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

      // ---- สัปดาห์นี้ (จ น พ พฤ ศ ส อา) ----
      const weekStart = startOfWeek(now);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);
      const prevWeekStart = new Date(weekStart);
      prevWeekStart.setDate(prevWeekStart.getDate() - 7);

      // งบรายสัปดาห์ = งบรวมรายเดือน ÷ 4 (ประมาณ 4 สัปดาห์ต่อเดือน)
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

  // Re-fetch on screen focus and when month changes
  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData])
  );

  const currentData = activeTab === 'week' ? weekData : monthData;

  // เลื่อนเดือน — ปีเลื่อนด้วยเมื่อข้ามเดือนมกราคม/ธันวาคม
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
                  {THAI_MONTHS[monthIndex]} {year + 543}
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