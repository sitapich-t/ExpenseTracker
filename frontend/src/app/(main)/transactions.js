import React, { useState, useCallback, useMemo } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  FlatList, 
  TouchableOpacity, 
  RefreshControl, 
  TextInput, 
  ScrollView, 
  SafeAreaView 
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { getToken, http } from '@/lib/api';
import { Ionicons } from '@expo/vector-icons';

const getCategoryDetails = (category) => {
  switch (category) {
    case 'Food': return { icon: '🍴', bg: '#fff3e0' };
    case 'Transport': return { icon: '🚆', bg: '#e3f2fd' };
    case 'Shopping': return { icon: '🛍️', bg: '#fce4ec' };
    case 'Study': return { icon: '📚', bg: '#e8f5e9' };
    case 'Entertainment': return { icon: '🎮', bg: '#f3e5f5' };
    case 'Health': return { icon: '💊', bg: '#e0f7fa' };
    case 'Bills': return { icon: '📄', bg: '#fff8e1' };
    default: return { icon: '💸', bg: '#f5f5f5' };
  }
};

const formatMoney = (amount) => {
  return `฿ ${parseFloat(amount).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatDate = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
};

const FILTER_TABS = [
  { id: 'today', label: 'วันนี้' },
  { id: 'week', label: 'สัปดาห์' },
  { id: 'month', label: 'เดือนนี้' },
  { id: 'all', label: 'ทั้งหมด' }
];

export default function TransactionsScreen() {
  const router = useRouter();
  const [transactions, setTransactions] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [activeTab, setActiveTab] = useState('month');

  const fetchTransactions = async () => {
    try {
      const token = await getToken();
      if (!token) return;

      const response = await http.get('/personal/transactions', {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setTransactions(response.data.transactions || []);
    } catch (error) {
      console.error('Error fetching transactions:', error);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchTransactions();
    }, [])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchTransactions();
    setRefreshing(false);
  }, []);

  const filteredTransactions = useMemo(() => {
    let filtered = [...transactions];

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(t => 
        (t.title && t.title.toLowerCase().includes(query)) || 
        (t.merchant && t.merchant.toLowerCase().includes(query))
      );
    }

    // Time filter
    const now = new Date();
    filtered = filtered.filter(t => {
      const tDate = new Date(t.created_at);
      switch (activeTab) {
        case 'today':
          return tDate.toDateString() === now.toDateString();
        case 'week':
          const weekAgo = new Date();
          weekAgo.setDate(now.getDate() - 7);
          return tDate >= weekAgo;
        case 'month':
          return tDate.getMonth() === now.getMonth() && tDate.getFullYear() === now.getFullYear();
        default:
          return true; // 'all'
      }
    });

    // Sort by date descending
    return filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }, [transactions, searchQuery, activeTab]);

  const summary = useMemo(() => {
    let income = 0;
    let expense = 0;
    filteredTransactions.forEach(t => {
      const amount = parseFloat(t.amount);
      if (t.type === 'income') {
        income += amount;
      } else {
        expense += amount;
      }
    });
    return { income, expense, balance: income - expense };
  }, [filteredTransactions]);

  const renderTransactionItem = ({ item }) => {
    const isIncome = item.type === 'income';
    const amountColor = isIncome ? '#2e7d32' : '#c62828';
    const amountPrefix = isIncome ? '+' : '-';
    const catDetails = getCategoryDetails(item.category);

    return (
      <View style={styles.transactionCard}>
        <View style={[styles.iconContainer, { backgroundColor: catDetails.bg }]}>
          <Text style={styles.iconText}>{catDetails.icon}</Text>
        </View>
        
        <View style={styles.transactionInfo}>
          <Text style={styles.transactionTitle} numberOfLines={1}>{item.title}</Text>
          <Text style={styles.transactionSubtitle}>
            {item.category} {item.merchant ? `• ${item.merchant}` : ''}
          </Text>
        </View>
        
        <View style={styles.amountContainer}>
          <Text style={[styles.transactionAmount, { color: amountColor }]}>
            {amountPrefix}{formatMoney(item.amount)}
          </Text>
          <Text style={styles.transactionDate}>{formatDate(item.created_at)}</Text>
        </View>
      </View>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyStateContainer}>
      <Text style={styles.emptyStateIcon}>👻</Text>
      <Text style={styles.emptyStateTitle}>ยังไม่มีรายการ</Text>
      <Text style={styles.emptyStateText}>
        คุณยังไม่มีรายการค่าใช้จ่ายหรือรายรับในขณะนี้{'\n'}กดปุ่ม + ด้านล่างเพื่อเพิ่มรายการใหม่
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>รายการของฉัน</Text>
        <TouchableOpacity onPress={() => setShowSearch(!showSearch)} style={styles.iconButton}>
          <Ionicons name="search" size={24} color="#5f3dc4" />
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      {showSearch && (
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color="#888" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="ค้นหาตามชื่อหรือร้านค้า..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoFocus
          />
          {searchQuery !== '' && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={20} color="#888" />
            </TouchableOpacity>
          )}
        </View>
      )}

      <ScrollView 
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#5f3dc4']} />}
      >
        {/* Summary Cards */}
        <View style={styles.summaryContainer}>
          <View style={[styles.summaryCard, styles.balanceCard]}>
            <Text style={styles.summaryLabelLight}>ยอดเงินคงเหลือ</Text>
            <Text style={styles.summaryValueLight}>{formatMoney(summary.balance)}</Text>
          </View>
          <View style={styles.row}>
            <View style={[styles.summaryCard, styles.incomeCard]}>
              <Text style={styles.summaryLabelDark}>รายรับทั้งหมด</Text>
              <Text style={[styles.summaryValueDark, { color: '#2e7d32' }]}>{formatMoney(summary.income)}</Text>
            </View>
            <View style={[styles.summaryCard, styles.expenseCard]}>
              <Text style={styles.summaryLabelDark}>รายจ่ายทั้งหมด</Text>
              <Text style={[styles.summaryValueDark, { color: '#c62828' }]}>{formatMoney(summary.expense)}</Text>
            </View>
          </View>
        </View>

        {/* Filter Tabs */}
        <View style={styles.filterContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
            {FILTER_TABS.map(tab => (
              <TouchableOpacity
                key={tab.id}
                style={[styles.filterTab, activeTab === tab.id && styles.activeFilterTab]}
                onPress={() => setActiveTab(tab.id)}
              >
                <Text style={[styles.filterTabText, activeTab === tab.id && styles.activeFilterTabText]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Transaction List */}
        <View style={styles.listContainer}>
          <FlatList
            data={filteredTransactions}
            keyExtractor={item => item.id?.toString()}
            renderItem={renderTransactionItem}
            ListEmptyComponent={renderEmptyState}
            scrollEnabled={false} // since it's inside a ScrollView
            contentContainerStyle={filteredTransactions.length === 0 ? styles.emptyListContent : null}
          />
        </View>
      </ScrollView>

      {/* Floating Action Button */}
      <TouchableOpacity 
        style={styles.fab}
        onPress={() => router.push('/add-transaction')}
      >
        <Ionicons name="add" size={30} color="#fff" />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fcfbfe',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 15,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  iconButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: '#f3e5f5',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 20,
    marginTop: 15,
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#333',
  },
  content: {
    flex: 1,
  },
  summaryContainer: {
    padding: 20,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 15,
  },
  summaryCard: {
    borderRadius: 16,
    padding: 20,
    shadowColor: '#5f3dc4',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  balanceCard: {
    backgroundColor: '#5f3dc4',
  },
  incomeCard: {
    flex: 1,
    backgroundColor: '#fff',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#e8f5e9',
  },
  expenseCard: {
    flex: 1,
    backgroundColor: '#fff',
    marginLeft: 8,
    borderWidth: 1,
    borderColor: '#ffebee',
  },
  summaryLabelLight: {
    color: '#e0d4fc',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  summaryValueLight: {
    color: '#fff',
    fontSize: 28,
    fontWeight: 'bold',
  },
  summaryLabelDark: {
    color: '#666',
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 6,
  },
  summaryValueDark: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  filterContainer: {
    marginBottom: 10,
  },
  filterScroll: {
    paddingHorizontal: 20,
  },
  filterTab: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#fff',
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  activeFilterTab: {
    backgroundColor: '#5f3dc4',
    borderColor: '#5f3dc4',
  },
  filterTabText: {
    color: '#666',
    fontSize: 14,
    fontWeight: '500',
  },
  activeFilterTabText: {
    color: '#fff',
    fontWeight: '600',
  },
  listContainer: {
    paddingHorizontal: 20,
    paddingBottom: 100,
  },
  transactionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  iconText: {
    fontSize: 24,
  },
  transactionInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  transactionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  transactionSubtitle: {
    fontSize: 13,
    color: '#888',
  },
  amountContainer: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  transactionAmount: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  transactionDate: {
    fontSize: 12,
    color: '#888',
  },
  emptyListContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  emptyStateContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyStateIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    lineHeight: 22,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#5f3dc4',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#5f3dc4',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
});
