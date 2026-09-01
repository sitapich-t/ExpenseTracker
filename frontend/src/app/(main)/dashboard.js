import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

export default function DashboardScreen() {
  const router = useRouter();
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      fetchTransactions();
    }, [])
  );

  const fetchTransactions = async () => {
    try {
      setLoading(true);
      const token = await AsyncStorage.getItem('token');
      if (!token) {
        router.replace('/login');
        return;
      }

      const res = await axios.get('http://192.168.0.3:3000/api/transactions/my', {
        headers: { Authorization: `Bearer ${token}` }
      });

      setTransactions(res.data.transactions || []);
    } catch (err) {
      console.log('Fetch error:', err.response?.data || err.message);
    } finally {
      setLoading(false);
    }
  };

  // Helper ดึง Icon ตาม Category
  const getCategoryIcon = (cat) => {
    switch (cat?.toLowerCase()) {
      case 'food': return '🍴';
      case 'transport': return '🚆';
      case 'study': return '📚';
      case 'shopping': return '🛍️';
      default: return '💸';
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#fcfbfe' }}>
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        {/* Top Header */}
        <View style={styles.headerRow}>
          <View style={styles.userSection}>
            <View style={styles.avatarCircle}>
              <Text style={{ fontSize: 18 }}>👩‍🎓</Text>
            </View>
            <Text style={styles.appName}>Student Wallet</Text>
          </View>
          <TouchableOpacity style={styles.iconBtn}>
            <Text style={{ fontSize: 20 }}>🔔</Text>
          </TouchableOpacity>
        </View>

        {/* Greeting Section */}
        <Text style={styles.greetingTitle}>Hi, Supanuch 👋</Text>
        <Text style={styles.greetingSub}>Let's check your finances today.</Text>

        {/* Balance Card */}
        <View style={styles.balanceCard}>
          <Text style={styles.cardLabel}>⬇ Income</Text>
          <Text style={styles.balanceText}>฿ 15,000.00</Text>
        </View>

        {/* Quick Action Grid */}
        <View style={styles.actionGrid}>
          <TouchableOpacity style={styles.actionItem} onPress={() => router.push('/add-transaction')}>
            <View style={styles.actionIconBg}><Text style={styles.actionSymbol}>—</Text></View>
            <Text style={styles.actionLabel}>Add Expense</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionItem} onPress={() => router.push('/add-transaction')}>
            <View style={styles.actionIconBg}><Text style={styles.actionSymbol}>+</Text></View>
            <Text style={styles.actionLabel}>Add Income</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionItem} onPress={() => router.push('/scan-receipt')}>
            <View style={styles.actionIconBg}><Text style={{ fontSize: 20 }}>🧾</Text></View>
            <Text style={styles.actionLabel}>Scan Receipt</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionItem}>
            <View style={styles.actionIconBg}><Text style={{ fontSize: 20 }}>👥</Text></View>
            <Text style={styles.actionLabel}>Groups</Text>
          </TouchableOpacity>
        </View>

        {/* Monthly Budget Card */}
        <View style={styles.budgetCard}>
          <View style={styles.budgetHeader}>
            <Text style={styles.budgetTitle}>Monthly Budget</Text>
            <Text style={styles.budgetPercent}>50%</Text>
          </View>
          <Text style={styles.budgetSub}>Remaining: ฿ 7,450</Text>
          
          {/* Progress Bar */}
          <View style={styles.progressTrack}>
            <View style={[styles.progressBar, { width: '50%' }]} />
          </View>
          
          <View style={styles.budgetFooter}>
            <Text style={styles.budgetText}>฿ 0</Text>
            <Text style={styles.budgetText}>฿ 10,000</Text>
          </View>
        </View>

        {/* Recent Transactions Header */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Transactions</Text>
          <TouchableOpacity><Text style={styles.seeAllText}>See All</Text></TouchableOpacity>
        </View>

        {/* Transaction List */}
        {loading ? (
          <ActivityIndicator size="small" color="#5f3dc4" style={{ marginVertical: 20 }} />
        ) : transactions.length === 0 ? (
          <Text style={styles.emptyText}>ยังไม่มีรายการบันทึก</Text>
        ) : (
          transactions.map((tx) => (
            <View key={tx.id} style={styles.txCard}>
              <View style={styles.txIconBg}>
                <Text style={{ fontSize: 22 }}>{getCategoryIcon(tx.category)}</Text>
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.txName}>{tx.title || tx.merchant}</Text>
                <Text style={styles.txSub}>
                  {tx.category || 'General'} • Today
                </Text>
              </View>
              <Text style={styles.txAmount}>
                - ฿ {parseFloat(tx.amount).toFixed(2)}
              </Text>
            </View>
          ))
        )}

        <View style={{ height: 90 }} />
      </ScrollView>

      {/* Floating Plus Button */}
      <TouchableOpacity 
        style={styles.fabBtn} 
        onPress={() => router.push('/add-transaction')}
      >
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 20, paddingTop: 45 },
  
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  userSection: { flexDirection: 'row', alignItems: 'center' },
  avatarCircle: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#eee',
    justify: 'center', alignItems: 'center', marginRight: 8
  },
  appName: { fontSize: 18, fontWeight: '700', color: '#5f3dc4' },
  iconBtn: { padding: 4 },

  greetingTitle: { fontSize: 24, fontWeight: '800', color: '#222', marginTop: 16 },
  greetingSub: { fontSize: 13, color: '#777', marginTop: 2, marginBottom: 15 },

  balanceCard: {
    backgroundColor: '#fff', borderRadius: 20, padding: 20,
    minHeight: 120, justifyContent: 'flex-end',
    elevation: 4, shadowColor: '#5f3dc4', shadowOpacity: 0.08, shadowRadius: 10,
    marginBottom: 20
  },
  cardLabel: { fontSize: 13, color: '#aaa', fontWeight: '500' },
  balanceText: { fontSize: 28, fontWeight: '800', color: '#333', marginTop: 4 },

  actionGrid: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  actionItem: { alignItems: 'center', flex: 1 },
  actionIconBg: {
    width: 55, height: 55, borderRadius: 16, backgroundColor: '#f0ebfe',
    justifyContent: 'center', alignItems: 'center', marginBottom: 6
  },
  actionSymbol: { fontSize: 24, fontWeight: '600', color: '#5f3dc4' },
  actionLabel: { fontSize: 11, color: '#555', textAlign: 'center', fontWeight: '500' },

  budgetCard: {
    backgroundColor: '#fff', borderRadius: 18, padding: 16,
    elevation: 2, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6,
    marginBottom: 20
  },
  budgetHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  budgetTitle: { fontSize: 16, fontWeight: '700', color: '#222' },
  budgetPercent: { fontSize: 14, fontWeight: '700', color: '#5f3dc4' },
  budgetSub: { fontSize: 12, color: '#777', marginTop: 4, marginBottom: 10 },
  progressTrack: { height: 10, backgroundColor: '#ede9fe', borderRadius: 5, overflow: 'hidden' },
  progressBar: { height: '100%', backgroundColor: '#5f3dc4', borderRadius: 5 },
  budgetFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  budgetText: { fontSize: 11, color: '#aaa' },

  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: '#222' },
  seeAllText: { fontSize: 13, fontWeight: '600', color: '#5f3dc4' },

  txCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    padding: 14, borderRadius: 16, marginBottom: 10,
    elevation: 1, shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 4
  },
  txIconBg: {
    width: 44, height: 44, borderRadius: 12, backgroundColor: '#fff3e0',
    justifyContent: 'center', alignItems: 'center'
  },
  txName: { fontSize: 14, fontWeight: '700', color: '#333' },
  txSub: { fontSize: 11, color: '#999', marginTop: 2 },
  txAmount: { fontSize: 14, fontWeight: '700', color: '#222' },
  emptyText: { textAlign: 'center', color: '#aaa', marginVertical: 20 },

  fabBtn: {
    position: 'absolute', bottom: 25, right: 20,
    width: 56, height: 56, borderRadius: 28, backgroundColor: '#5f3dc4',
    justifyContent: 'center', alignItems: 'center',
    elevation: 6, shadowColor: '#5f3dc4', shadowOpacity: 0.4, shadowRadius: 8
  },
  fabText: { color: '#fff', fontSize: 32, marginTop: -2, fontWeight: '300' }
});