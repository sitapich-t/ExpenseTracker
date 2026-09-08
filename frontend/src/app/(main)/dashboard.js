import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, RefreshControl
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';

const API_BASE_URL = global.__API_URL__ || 'http://192.168.1.45:3000';

export default function DashboardScreen() {
  const router = useRouter();
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userName, setUserName] = useState('User');
  
  // Totals
  const [totalIncome, setTotalIncome] = useState(0);
  const [totalExpense, setTotalExpense] = useState(0);
  
  // Budget
  const [monthlyBudget, setMonthlyBudget] = useState(10000);

  const fetchData = async () => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        router.replace('/login');
        return;
      }

// Get user info
      const userStr = await AsyncStorage.getItem('user');
      if (userStr) {
        const user = JSON.parse(userStr);
        if (user.name) setUserName(user.name);
      }

      // Get budget
      const budgetStr = await AsyncStorage.getItem('monthlyBudget');
      if (budgetStr) {
        setMonthlyBudget(parseFloat(budgetStr));
      }

      const res = await axios.get(`${API_BASE_URL}/api/v1/personal/transactions`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const txs = res.data.transactions || [];
      setTransactions(txs.slice(0, 5)); // Show only 5 recent

      // Calculate totals for current month
      const currentMonth = new Date().getMonth();
      const currentYear = new Date().getFullYear();
      
      let inc = 0;
      let exp = 0;
      
      txs.forEach(tx => {
        const txDate = new Date(tx.created_at);
        if (txDate.getMonth() === currentMonth && txDate.getFullYear() === currentYear) {
          if (tx.type === 'income') inc += parseFloat(tx.amount);
          else exp += parseFloat(tx.amount);
        }
      });
      
      setTotalIncome(inc);
      setTotalExpense(exp);

    } catch (err) {
      console.log('Fetch error:', err.response?.data || err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchData();
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const getCategoryIcon = (cat) => {
    switch (cat?.toLowerCase()) {
      case 'food': return { icon: 'restaurant', bg: '#fff3e0', color: '#e65100' };
      case 'transport': return { icon: 'bus', bg: '#e3f2fd', color: '#1565c0' };
      case 'shopping': return { icon: 'bag-handle', bg: '#fce4ec', color: '#c62828' };
      case 'study': return { icon: 'book', bg: '#e8f5e9', color: '#2e7d32' };
      case 'entertainment': return { icon: 'game-controller', bg: '#f3e5f5', color: '#7b1fa2' };
      case 'health': return { icon: 'medkit', bg: '#e0f7fa', color: '#00838f' };
      case 'bills': return { icon: 'receipt', bg: '#fff8e1', color: '#f57f17' };
      default: return { icon: 'wallet', bg: '#f5f5f5', color: '#616161' };
    }
  };

  const balance = totalIncome - totalExpense;
  const budgetPercent = monthlyBudget > 0 ? (totalExpense / monthlyBudget) * 100 : 0;
  const budgetProgress = Math.min(budgetPercent, 100);
  const progressColor = budgetPercent > 80 ? '#ef4444' : budgetPercent > 50 ? '#f59e0b' : '#10b981';

  return (
    <View style={{ flex: 1, backgroundColor: '#fcfbfe' }}>
      <ScrollView 
        style={styles.container} 
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#5f3dc4" />}
      >
        {/* Top Header */}
        <View style={styles.headerRow}>
          <View style={styles.userSection}>
            <View style={styles.avatarCircle}>
              <Ionicons name="person" size={20} color="#5f3dc4" />
            </View>
            <View>
              <Text style={styles.greetingSub}>ยินดีต้อนรับกลับมา 👋</Text>
              <Text style={styles.greetingTitle}>{userName}</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.iconBtn}>
            <Ionicons name="notifications-outline" size={24} color="#333" />
          </TouchableOpacity>
        </View>

        {/* Balance Card */}
        <View style={styles.balanceCard}>
          <View style={styles.balanceHeader}>
            <Text style={styles.cardLabel}>ยอดเงินคงเหลือ (เดือนนี้)</Text>
            <Ionicons name="wallet" size={20} color="#fff" style={{ opacity: 0.8 }} />
          </View>
          <Text style={styles.balanceText}>฿ {balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</Text>
          
          <View style={styles.balanceRow}>
            <View style={styles.incomeExpense}>
              <View style={[styles.arrowBg, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
                <Ionicons name="arrow-down" size={14} color="#fff" />
              </View>
              <View>
                <Text style={styles.ieLabel}>รายรับ</Text>
                <Text style={styles.ieValue}>฿ {totalIncome.toLocaleString()}</Text>
              </View>
            </View>
            
            <View style={styles.incomeExpense}>
              <View style={[styles.arrowBg, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
                <Ionicons name="arrow-up" size={14} color="#fff" />
              </View>
              <View>
                <Text style={styles.ieLabel}>รายจ่าย</Text>
                <Text style={styles.ieValue}>฿ {totalExpense.toLocaleString()}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Quick Action Grid */}
        <View style={styles.actionGrid}>
          <TouchableOpacity style={styles.actionItem} onPress={() => router.push('/add-transaction')}>
            <View style={styles.actionIconBg}><Ionicons name="add-circle" size={26} color="#5f3dc4" /></View>
            <Text style={styles.actionLabel}>เพิ่มรายการ</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionItem} onPress={() => router.push('/scan-receipt')}>
            <View style={styles.actionIconBg}><Ionicons name="scan" size={24} color="#5f3dc4" /></View>
            <Text style={styles.actionLabel}>สแกนใบเสร็จ</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionItem} onPress={() => router.push('/transactions')}>
            <View style={styles.actionIconBg}><Ionicons name="list" size={24} color="#5f3dc4" /></View>
            <Text style={styles.actionLabel}>ประวัติ</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionItem} onPress={() => router.push('/budget')}>
            <View style={styles.actionIconBg}><Ionicons name="pie-chart" size={24} color="#5f3dc4" /></View>
            <Text style={styles.actionLabel}>งบประมาณ</Text>
          </TouchableOpacity>
        </View>

        {/* Monthly Budget Card */}
        <TouchableOpacity style={styles.budgetCard} onPress={() => router.push('/budget')} activeOpacity={0.8}>
          <View style={styles.budgetHeader}>
            <Text style={styles.budgetTitle}>งบประมาณรายเดือน</Text>
            <Text style={[styles.budgetPercent, { color: progressColor }]}>{budgetPercent.toFixed(0)}%</Text>
          </View>
          <Text style={styles.budgetSub}>เหลืองบอีก: ฿ {Math.max(0, monthlyBudget - totalExpense).toLocaleString()}</Text>
          
          {/* Progress Bar */}
          <View style={styles.progressTrack}>
            <View style={[styles.progressBar, { width: `${budgetProgress}%`, backgroundColor: progressColor }]} />
          </View>
          
          <View style={styles.budgetFooter}>
            <Text style={styles.budgetText}>ใช้ไป ฿ {totalExpense.toLocaleString()}</Text>
            <Text style={styles.budgetText}>จาก ฿ {monthlyBudget.toLocaleString()}</Text>
          </View>
        </TouchableOpacity>

        {/* Recent Transactions Header */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>รายการล่าสุด</Text>
          <TouchableOpacity onPress={() => router.push('/transactions')}>
            <Text style={styles.seeAllText}>ดูทั้งหมด</Text>
          </TouchableOpacity>
        </View>

        {/* Transaction List */}
        {loading && !refreshing ? (
          <ActivityIndicator size="small" color="#5f3dc4" style={{ marginVertical: 20 }} />
        ) : transactions.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>ยังไม่มีรายการบันทึก</Text>
          </View>
        ) : (
          transactions.map((tx) => {
            const cat = getCategoryIcon(tx.category);
            const isIncome = tx.type === 'income';
            return (
              <View key={tx.id} style={styles.txCard}>
                <View style={[styles.txIconBg, { backgroundColor: cat.bg }]}>
                  <Ionicons name={cat.icon} size={20} color={cat.color} />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.txName} numberOfLines={1}>{tx.title || tx.merchant}</Text>
                  <Text style={styles.txSub}>
                    {new Date(tx.created_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}
                  </Text>
                </View>
                <Text style={[styles.txAmount, { color: isIncome ? '#10b981' : '#ef4444' }]}>
                  {isIncome ? '+' : '-'} ฿ {parseFloat(tx.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </Text>
              </View>
            );
          })
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 20, paddingTop: 50 },
  
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  userSection: { flexDirection: 'row', alignItems: 'center' },
  avatarCircle: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: '#f0ebfe',
    justifyContent: 'center', alignItems: 'center', marginRight: 12
  },
  greetingSub: { fontSize: 12, color: '#777', marginBottom: 2 },
  greetingTitle: { fontSize: 18, fontWeight: '800', color: '#222' },
  iconBtn: { padding: 8, backgroundColor: '#fff', borderRadius: 20, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5 },

  balanceCard: {
    backgroundColor: '#5f3dc4', borderRadius: 24, padding: 24,
    elevation: 8, shadowColor: '#5f3dc4', shadowOpacity: 0.3, shadowRadius: 15, shadowOffset: { width: 0, height: 8 },
    marginBottom: 24
  },
  balanceHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  cardLabel: { fontSize: 14, color: '#e0d4fc', fontWeight: '500' },
  balanceText: { fontSize: 32, fontWeight: '800', color: '#fff', marginBottom: 24 },
  balanceRow: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)', paddingTop: 16 },
  incomeExpense: { flexDirection: 'row', alignItems: 'center' },
  arrowBg: { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  ieLabel: { fontSize: 12, color: '#e0d4fc', marginBottom: 2 },
  ieValue: { fontSize: 15, fontWeight: '700', color: '#fff' },

  actionGrid: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 },
  actionItem: { alignItems: 'center', flex: 1 },
  actionIconBg: {
    width: 56, height: 56, borderRadius: 18, backgroundColor: '#fff',
    justifyContent: 'center', alignItems: 'center', marginBottom: 8,
    elevation: 2, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8
  },
  actionLabel: { fontSize: 12, color: '#555', textAlign: 'center', fontWeight: '600' },

  budgetCard: {
    backgroundColor: '#fff', borderRadius: 20, padding: 20,
    elevation: 3, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10,
    marginBottom: 24
  },
  budgetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  budgetTitle: { fontSize: 16, fontWeight: '700', color: '#222' },
  budgetPercent: { fontSize: 15, fontWeight: '800' },
  budgetSub: { fontSize: 13, color: '#777', marginTop: 6, marginBottom: 16 },
  progressTrack: { height: 10, backgroundColor: '#f1f3f5', borderRadius: 5, overflow: 'hidden' },
  progressBar: { height: '100%', borderRadius: 5 },
  budgetFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  budgetText: { fontSize: 12, color: '#888', fontWeight: '500' },

  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#222' },
  seeAllText: { fontSize: 14, fontWeight: '600', color: '#5f3dc4' },

  txCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    padding: 16, borderRadius: 16, marginBottom: 12,
    elevation: 2, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6
  },
  txIconBg: {
    width: 46, height: 46, borderRadius: 14,
    justifyContent: 'center', alignItems: 'center'
  },
  txName: { fontSize: 15, fontWeight: '600', color: '#333' },
  txSub: { fontSize: 12, color: '#888', marginTop: 4 },
  txAmount: { fontSize: 15, fontWeight: '700' },
  emptyContainer: { padding: 30, alignItems: 'center', backgroundColor: '#fff', borderRadius: 16, borderStyle: 'dashed', borderWidth: 1, borderColor: '#ccc' },
  emptyText: { textAlign: 'center', color: '#aaa', fontWeight: '500' },
});