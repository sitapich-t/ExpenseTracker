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
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { getToken, http } from '@/lib/api';
import { Ionicons } from '@expo/vector-icons';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';

// แผนที่หมวดหมู่ทั้งภาษาไทยและอังกฤษ พร้อมไอคอนและสีพื้นหลัง
const CATEGORY_MAP = {
  food: { name: 'อาหารและเครื่องดื่ม', icon: '🍴', bg: '#fff3e0' },
  transport: { name: 'เดินทาง', icon: '🚆', bg: '#e3f2fd' },
  shopping: { name: 'ช้อปปิ้ง', icon: '🛍️', bg: '#fce4ec' },
  study: { name: 'การศึกษา', icon: '📚', bg: '#e8f5e9' },
  education: { name: 'การศึกษา', icon: '📚', bg: '#e8f5e9' },
  entertainment: { name: 'บันเทิง', icon: '🎮', bg: '#f3e5f5' },
  health: { name: 'สุขภาพ', icon: '💊', bg: '#e0f7fa' },
  bills: { name: 'บิล/ค่าใช้จ่าย', icon: '📄', bg: '#fff8e1' },
  housing: { name: 'ที่พัก', icon: '🏠', bg: '#ede9fe' },
  utilities: { name: 'สาธารณูปโภค', icon: '💡', bg: '#fef9c3' },
  salary: { name: 'เงินเดือน', icon: '💰', bg: '#dcfce7' },
  freelance: { name: 'ฟรีแลนซ์', icon: '💻', bg: '#ede9fe' },
  investment: { name: 'การลงทุน', icon: '📈', bg: '#e0f2fe' },
  gift: { name: 'ของขวัญ', icon: '🎁', bg: '#ffe4e6' },
  travel: { name: 'ท่องเที่ยว', icon: '✈️', bg: '#e0f2fe' },
  other: { name: 'อื่น ๆ', icon: '💸', bg: '#f5f5f5' },
  general: { name: 'ทั่วไป', icon: '💸', bg: '#f5f5f5' },
};

// ดึงชื่อหมวดหมู่ภาษาไทย
const resolveCategoryName = (item) => {
  if (!item) return 'ทั่วไป';
  const raw = item.categories?.name || item.category;
  if (raw && typeof raw === 'string') {
    const key = raw.toLowerCase().trim();
    if (CATEGORY_MAP[key]) return CATEGORY_MAP[key].name;
    for (const val of Object.values(CATEGORY_MAP)) {
      if (val.name.toLowerCase() === key) return val.name;
    }
    return raw;
  }
  // อนุมานจากชื่อรายการ (title) ถ้าเป็นหมวดที่พบบ่อย
  if (item.title) {
    const titleKey = item.title.trim().toLowerCase();
    for (const [key, val] of Object.entries(CATEGORY_MAP)) {
      if (titleKey === key || titleKey.includes(val.name) || val.name.includes(titleKey)) {
        return val.name;
      }
    }
  }
  if (item.type === 'income') return 'รายรับ';
  return 'ทั่วไป';
};

// ดึงไอคอนและสีพื้นหลังของหมวดหมู่ รองรับทั้ง object, item, และ string
const getCategoryDetails = (item) => {
  const target = (
    typeof item === 'string'
      ? item
      : (item?.categories?.name || item?.category || item?.title || '')
  ).toLowerCase().trim();

  if (target.includes('food') || target.includes('อาหาร') || target.includes('กิน') || target.includes('ข้าว') || target.includes('เครื่องดื่ม') || target.includes('กาแฟ')) {
    return { icon: '🍴', bg: '#fff3e0' };
  }
  if (target.includes('transport') || target.includes('เดินทาง') || target.includes('รถ') || target.includes('bts') || target.includes('mrt')) {
    return { icon: '🚆', bg: '#e3f2fd' };
  }
  if (target.includes('shopping') || target.includes('ช้อป') || target.includes('ช็อป') || target.includes('ซื้อของ')) {
    return { icon: '🛍️', bg: '#fce4ec' };
  }
  if (target.includes('study') || target.includes('education') || target.includes('เรียน') || target.includes('ศึกษา') || target.includes('หนังสือ')) {
    return { icon: '📚', bg: '#e8f5e9' };
  }
  if (target.includes('entertain') || target.includes('บันเทิง') || target.includes('เกม') || target.includes('หนัง')) {
    return { icon: '🎮', bg: '#f3e5f5' };
  }
  if (target.includes('health') || target.includes('สุขภาพ') || target.includes('ยา') || target.includes('หมอ') || target.includes('คลินิก')) {
    return { icon: '💊', bg: '#e0f7fa' };
  }
  if (target.includes('bill') || target.includes('บิล') || target.includes('ไฟ') || target.includes('น้ำ') || target.includes('เน็ต') || target.includes('สาธารณูปโภค')) {
    return { icon: '📄', bg: '#fff8e1' };
  }
  if (target.includes('salary') || target.includes('เงินเดือน') || target.includes('รายได้') || target.includes('โบนัส')) {
    return { icon: '💰', bg: '#dcfce7' };
  }
  if (target.includes('travel') || target.includes('เที่ยว') || target.includes('บิน') || target.includes('ตั๋ว')) {
    return { icon: '✈️', bg: '#e0f2fe' };
  }
  if (target.includes('gift') || target.includes('ของขวัญ')) {
    return { icon: '🎁', bg: '#ffe4e6' };
  }
  if (target.includes('housing') || target.includes('ที่พัก') || target.includes('หอพัก') || target.includes('คอนโด')) {
    return { icon: '🏠', bg: '#ede9fe' };
  }
  return { icon: '💸', bg: '#f5f5f5' };
};

// ฟังก์ชันแปลงข้อความภาษาไทย/อังกฤษให้อยู่ในรูป NFC และตัวพิมพ์เล็กเพื่อเทียบคำค้นหาได้แม่นยำ
const normalizeThaiText = (text) => {
  if (!text) return '';
  return String(text).normalize('NFC').toLowerCase().trim();
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
  const [deletingId, setDeletingId] = useState(null);

  // ลบรายการ: เตือนผู้ใช้ก่อนเสมอ และยืนยันอีกครั้งก่อนยิง API
  const performDelete = async (item) => {
    try {
      setDeletingId(item.id);
      const token = await getToken();
      if (!token) {
        Alert.alert('ข้อผิดพลาด', 'กรุณาเข้าสู่ระบบอีกครั้ง');
        return;
      }

      const res = await http.delete(`/personal/transactions/${item.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.data?.success) {
        setTransactions(prev => prev.filter((t) => t.id !== item.id));
        Alert.alert('ลบสำเร็จ', 'ลบรายการเรียบร้อยแล้ว');
      } else {
        Alert.alert('ข้อผิดพลาด', res.data?.error || 'ไม่สามารถลบรายการได้');
      }
    } catch (err) {
      console.error('Delete transaction error:', err);
      Alert.alert('ข้อผิดพลาด', 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้');
    } finally {
      setDeletingId(null);
    }
  };

  const handleDelete = (item) => {
    const catName = resolveCategoryName(item);
    Alert.alert(
      'ยืนยันการลบรายการ',
      `ต้องการลบ "${item.title}" ใช่หรือไม่?\n\n${catName} • ${formatMoney(item.amount)}\n\nการลบแล้วไม่สามารถย้อนกลับได้`,
      [
        { text: 'ยกเลิก', style: 'cancel' },
        { text: 'ลบรายการ', style: 'destructive', onPress: () => performDelete(item) },
      ]
    );
  };

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

    // Search filter: รองรับภาษาไทย ภาษาอังกฤษ หมวดหมู่ ร้านค้า โน้ต ยอดเงิน
    const rawQuery = (searchQuery || '').trim();
    if (rawQuery) {
      const normalizedQuery = normalizeThaiText(rawQuery);
      const queryTokens = normalizedQuery.split(/\s+/).filter(Boolean);

      filtered = filtered.filter(t => {
        const title = normalizeThaiText(t.title);
        const merchant = normalizeThaiText(t.merchant);
        const rawCategory = normalizeThaiText(t.category || t.categories?.name);
        const resolvedCategory = normalizeThaiText(resolveCategoryName(t));
        const note = normalizeThaiText(t.note || t.description);
        const payment = normalizeThaiText(t.payment_method || t.payment);
        const amountStr = String(t.amount || '');
        const formattedAmountStr = normalizeThaiText(formatMoney(t.amount || 0));
        const typeStr = t.type === 'income' ? 'รายรับ รายได้ เงินเข้า income' : 'รายจ่าย ค่าใช้จ่าย เงินออก expense';

        // รวมข้อความค้นหาทั้งหมดของรายการ
        const searchableText = `${title} ${merchant} ${rawCategory} ${resolvedCategory} ${note} ${payment} ${amountStr} ${formattedAmountStr} ${typeStr}`;

        // ทุกคำที่พิมพ์ค้นหาต้องตรงกับอย่างน้อย 1 ส่วนของรายการ
        return queryTokens.every(token => searchableText.includes(token));
      });
    }

    // Time filter
    const now = new Date();
    filtered = filtered.filter(t => {
      // ใช้ transaction_date ก่อน (field ที่ผู้ใช้เลือกวันที่เอง) ค่อย fallback ไป created_at
      // ตามที่ dashboard.js / budget.js / analytics.js ใช้
      const tDate = new Date(t.transaction_date || t.created_at);
      if (isNaN(tDate)) return false;
      switch (activeTab) {
        case 'today':
          return tDate.toDateString() === now.toDateString();
        case 'week': {
          const weekAgo = new Date();
          weekAgo.setDate(now.getDate() - 7);
          return tDate >= weekAgo;
        }
        case 'month':
          return tDate.getMonth() === now.getMonth() && tDate.getFullYear() === now.getFullYear();
        default:
          return true; // 'all'
      }
    });

    // Sort by date descending
    return filtered.sort(
      (a, b) =>
        new Date(b.transaction_date || b.created_at) - new Date(a.transaction_date || a.created_at)
    );
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
    const catDetails = getCategoryDetails(item);
    const catName = resolveCategoryName(item);
    const hasMerchant = item.merchant && item.merchant !== 'General' && item.merchant.trim() !== '' && item.merchant !== item.title;
    const displaySubtitle = hasMerchant ? `${catName} • ${item.merchant}` : catName;
    const isDeleting = deletingId === item.id;

    // ปัดซ้ายเพื่อเผยปุ่มลบ
    const renderRightActions = (progress, translation, swipeableMethods) => (
      <View style={styles.swipeActions}>
        <TouchableOpacity
          style={[styles.swipeActionButton, isDeleting && styles.swipeActionDisabled]}
          activeOpacity={0.8}
          disabled={isDeleting}
          onPress={() => {
            swipeableMethods.close();
            handleDelete(item);
          }}
        >
          {isDeleting ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Ionicons name="trash-outline" size={22} color="#ffffff" />
          )}
          <Text style={styles.swipeActionText}>{isDeleting ? 'กำลังลบ' : 'ลบ'}</Text>
        </TouchableOpacity>
      </View>
    );

    return (
      <ReanimatedSwipeable
        friction={2}
        rightThreshold={40}
        overshootRight={false}
        renderRightActions={renderRightActions}
        containerStyle={styles.swipeableContainer}
      >
        <TouchableOpacity
          style={styles.transactionCard}
          activeOpacity={0.7}
          onPress={() => router.push({ pathname: '/add-transaction', params: { edit: String(item.id) } })}
        >
          <View style={[styles.iconContainer, { backgroundColor: catDetails.bg }]}>
            <Text style={styles.iconText}>{catDetails.icon}</Text>
          </View>

          <View style={styles.transactionInfo}>
            <Text style={styles.transactionTitle} numberOfLines={1}>{item.title}</Text>
            <Text style={styles.transactionSubtitle} numberOfLines={1}>
              {displaySubtitle}
            </Text>
          </View>

          <View style={styles.amountContainer}>
            <Text style={[styles.transactionAmount, { color: amountColor }]}>
              {amountPrefix}{formatMoney(item.amount)}
            </Text>
            <Text style={styles.transactionDate}>{formatDate(item.transaction_date || item.created_at)}</Text>
          </View>
        </TouchableOpacity>
      </ReanimatedSwipeable>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyStateContainer}>
      <Text style={styles.emptyStateIcon}>{searchQuery ? '🔍' : '👻'}</Text>
      <Text style={styles.emptyStateTitle}>{searchQuery ? 'ไม่พบรายการที่ค้นหา' : 'ยังไม่มีรายการ'}</Text>
      <Text style={styles.emptyStateText}>
        {searchQuery 
          ? `ไม่พบรายการที่ตรงกับ "${searchQuery}"\nลองค้นหาด้วยชื่ออื่น หมวดหมู่ หรือร้านค้า`
          : `คุณยังไม่มีรายการค่าใช้จ่ายหรือรายรับในขณะนี้\nกดปุ่ม + ด้านล่างเพื่อเพิ่มรายการใหม่`}
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
            placeholder="ค้นหาตามชื่อ หมวดหมู่ หรือร้านค้า..."
            placeholderTextColor="#888"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="default"
            returnKeyType="search"
          />
          {searchQuery !== '' && (
            <TouchableOpacity 
              onPress={() => setSearchQuery('')}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
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
  swipeableContainer: {
    marginBottom: 12,
    borderRadius: 16,
    overflow: 'hidden',
  },
  swipeActions: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  swipeActionButton: {
    width: 92,
    backgroundColor: '#e53935',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  swipeActionDisabled: {
    backgroundColor: '#b71c1c',
  },
  swipeActionText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
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
    paddingVertical: Platform.OS === 'ios' ? 0 : 2,
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
