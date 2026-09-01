import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons, Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { useRouter, useFocusEffect } from 'expo-router';

const API_BASE_URL = 'http://192.168.0.3:3000/api';

export default function GroupSplitScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // สมมติตัวอย่างข้อมูลกลุ่มเริ่มต้น
  const [groups, setGroups] = useState([
    {
      id: '1',
      name: 'Dorm Mates',
      members_count: 4,
      total_spend: 4200,
      status_type: 'owe', // owe | receive | settled
      amount: 150,
      icon: 'home-outline',
      icon_bg: '#ede9fe',
      icon_color: '#6d28d9',
    },
    {
      id: '2',
      name: 'Phuket Trip',
      members_count: 6,
      total_spend: 12500,
      status_type: 'receive',
      amount: 45,
      icon: 'airplane-outline',
      icon_bg: '#dbeafe',
      icon_color: '#2563eb',
    },
    {
      id: '3',
      name: 'CS Project',
      members_count: 3,
      total_spend: 850,
      status_type: 'settled',
      amount: 0,
      icon: 'laptop-outline',
      icon_bg: '#f3e8ff',
      icon_color: '#9333ea',
    },
  ]);

  // ดึงข้อมูลกลุ่มใหม่ทุกครั้งที่สลับกลับมาหน้านี้
  useFocusEffect(
    useCallback(() => {
      fetchMyGroups();
    }, [])
  );

  const fetchMyGroups = async () => {
    try {
      setLoading(true);
      const token = await AsyncStorage.getItem('userToken');
      if (!token) return;

      const res = await axios.get(`${API_BASE_URL}/groups/my`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.data?.groups && Array.isArray(res.data.groups)) {
        setGroups(res.data.groups);
      }
    } catch (err) {
      console.log('Error fetching groups:', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const renderStatusBadge = (type, amount) => {
    const formattedAmount = (amount ?? 0).toLocaleString();

    if (type === 'owe') {
      return (
        <View style={[styles.badge, styles.badgeOwe]}>
          <Ionicons name="arrow-down" size={14} color="#dc2626" />
          <Text style={styles.badgeTextOwe}>You Owe: ฿{formattedAmount}</Text>
        </View>
      );
    }
    if (type === 'receive') {
      return (
        <View style={[styles.badge, styles.badgeReceive]}>
          <Ionicons name="arrow-up" size={14} color="#6d28d9" />
          <Text style={styles.badgeTextReceive}>You Receive: ฿{formattedAmount}</Text>
        </View>
      );
    }
    return (
      <View style={[styles.badge, styles.badgeSettled]}>
        <Ionicons name="checkmark-circle-outline" size={15} color="#4c1d95" />
        <Text style={styles.badgeTextSettled}>Settled Up</Text>
      </View>
    );
  };

  return (
    <ScrollView
      style={styles.container}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            fetchMyGroups();
          }}
        />
      }
    >
      {/* Header Bar */}
      <View style={styles.header}>
        <View style={styles.logoRow}>
          <View style={styles.logoBox}>
            <MaterialCommunityIcons name="wallet-outline" size={20} color="#6d28d9" />
          </View>
          <Text style={styles.headerTitle}>Student Wallet</Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.iconBtn}>
            <Ionicons name="search-outline" size={22} color="#333" />
          </TouchableOpacity>
          <Image
            source={{ uri: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100' }}
            style={styles.avatar}
          />
        </View>
      </View>

      <Text style={styles.sectionTitle}>Groups Overview</Text>

      {/* Action Buttons Row */}
      <View style={styles.actionRow}>
        <TouchableOpacity
          style={styles.createBtn}
          onPress={() => router.push('/create-group')}
        >
          <Ionicons name="add" size={22} color="#fff" />
          <Text style={styles.createBtnText}>Create New{'\n'}Group</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.qrBtn}>
          <Ionicons name="qr-code-outline" size={20} color="#1e1b4b" />
          <Text style={styles.qrBtnText}>Join via QR</Text>
        </TouchableOpacity>
      </View>

      {/* Groups List */}
      {loading && !refreshing ? (
        <ActivityIndicator size="large" color="#6d28d9" style={{ marginTop: 40 }} />
      ) : (
        groups.map((item) => {
          // ดึงค่าอย่างปลอดภัย รองรับทั้ง camelCase และ snake_case
          const totalSpend = item.total_spend ?? item.totalSpend ?? 0;
          const statusType = item.status_type ?? item.statusType ?? 'settled';
          const membersCount = item.members_count ?? item.membersCount ?? 1;
          const iconName = item.icon || 'home-outline';
          const iconBg = item.icon_bg ?? item.iconBg ?? '#ede9fe';
          const iconColor = item.icon_color ?? item.iconColor ?? '#6d28d9';
          const amount = item.amount ?? 0;

          return (
            <TouchableOpacity
              key={item.id}
              style={styles.groupCard}
              activeOpacity={0.7}
              onPress={() => {
                router.push({
                  pathname: '/group-detail',
                  params: { id: item.id, name: item.name },
                });
              }}
            >
              {/* Top Info Header */}
              <View style={styles.cardHeader}>
                <View style={styles.cardHeaderLeft}>
                  <View style={[styles.groupIconBox, { backgroundColor: iconBg }]}>
                    <Ionicons name={iconName} size={22} color={iconColor} />
                  </View>
                  <View style={{ marginLeft: 12 }}>
                    <Text style={styles.groupName}>{item.name}</Text>
                    <View style={styles.memberRow}>
                      <Ionicons name="people-outline" size={14} color="#666" />
                      <Text style={styles.memberText}>{membersCount} members</Text>
                    </View>
                  </View>
                </View>
                <TouchableOpacity style={{ padding: 4 }}>
                  <Feather name="more-vertical" size={18} color="#666" />
                </TouchableOpacity>
              </View>

              <View style={styles.divider} />

              {/* Card Footer Balance Info */}
              <View style={styles.cardFooter}>
                <View>
                  <Text style={styles.spendLabel}>TOTAL SPEND</Text>
                  <Text style={styles.spendAmount}>
                    ฿{totalSpend.toLocaleString()}
                  </Text>
                </View>
                {renderStatusBadge(statusType, amount)}
              </View>
            </TouchableOpacity>
          );
        })
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', paddingHorizontal: 20, paddingTop: 50 },
  
  // Header
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  logoRow: { flexDirection: 'row', alignItems: 'center' },
  logoBox: {
    width: 32, height: 32, borderRadius: 8, backgroundColor: '#ede9fe',
    justifyContent: 'center', alignItems: 'center', marginRight: 8,
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#0f172a' },
  headerRight: { flexDirection: 'row', alignItems: 'center' },
  iconBtn: { padding: 6, marginRight: 8 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#ddd' },

  sectionTitle: { fontSize: 20, fontWeight: '700', color: '#1e293b', marginBottom: 16 },

  // Action Buttons
  actionRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  createBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#6d28d9',
    paddingVertical: 14, paddingHorizontal: 16, borderRadius: 16, marginRight: 8,
  },
  createBtnText: { color: '#fff', fontWeight: '700', fontSize: 13, marginLeft: 8, lineHeight: 18 },
  qrBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#e0e7ff', paddingVertical: 14, paddingHorizontal: 16,
    borderRadius: 16, marginLeft: 8,
  },
  qrBtnText: { color: '#1e1b4b', fontWeight: '700', fontSize: 14, marginLeft: 8 },

  // Group Cards
  groupCard: {
    backgroundColor: '#fff', borderRadius: 20, padding: 16, marginBottom: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04,
    shadowRadius: 8, elevation: 2, borderWidth: 1, borderColor: '#f1f5f9',
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardHeaderLeft: { flexDirection: 'row', alignItems: 'center' },
  groupIconBox: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  groupName: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  memberRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  memberText: { fontSize: 13, color: '#64748b', marginLeft: 4 },

  divider: { height: 1, backgroundColor: '#f1f5f9', marginVertical: 14 },

  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  spendLabel: { fontSize: 10, fontWeight: '700', color: '#94a3b8', letterSpacing: 0.5 },
  spendAmount: { fontSize: 15, fontWeight: '800', color: '#0f172a', marginTop: 2 },

  // Badges
  badge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  badgeOwe: { backgroundColor: '#fee2e2' },
  badgeTextOwe: { color: '#dc2626', fontSize: 12, fontWeight: '700', marginLeft: 4 },
  badgeReceive: { backgroundColor: '#f3e8ff' },
  badgeTextReceive: { color: '#6d28d9', fontSize: 12, fontWeight: '700', marginLeft: 4 },
  badgeSettled: { backgroundColor: '#ede9fe' },
  badgeTextSettled: { color: '#4c1d95', fontSize: 12, fontWeight: '700', marginLeft: 4 },
});