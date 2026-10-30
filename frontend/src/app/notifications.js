import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { getToken, http } from '@/lib/api';
import { SHADOWS } from '@/lib/theme';

export default function NotificationsScreen() {
  const router = useRouter();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchNotifications = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) {
        setNotifications([]);
        return;
      }
      const res = await http.get('/notifications', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.data?.success) {
        setNotifications(res.data.notifications || []);
      }
    } catch (err) {
      console.log('Fetch notifications error:', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchNotifications();
  };

  const handleMarkAllRead = async () => {
    try {
      const token = await getToken();
      await http.patch(
        '/notifications/read',
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch (err) {
      console.log('Mark read error:', err.message);
    }
  };

  // กดที่รายการแจ้งเตือนเพื่อนำทางไปยังหน้าที่เกี่ยวข้อง (Deep Navigation)
  const handlePressNotification = async (item) => {
    // 1. Mark this item as read if unread
    if (!item.is_read) {
      try {
        const token = await getToken();
        await http.patch(
          '/notifications/read',
          { ids: [item.id] },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setNotifications((prev) =>
          prev.map((n) => (n.id === item.id ? { ...n, is_read: true } : n))
        );
      } catch (e) {}
    }

    // 2. Navigate based on notification type and data
    if (item.group_id) {
      const groupName = item.groups?.name || 'รายละเอียดกลุ่ม';
      // ถ้าเป็นการทวงเงิน หรือยืนยันรับเงิน สามารถพาไปที่หน้าเคลียร์บิลหรือหน้ารายละเอียดกลุ่มได้โดยตรง
      if (item.type === 'debt_reminder') {
        router.push({
          pathname: '/settle-group',
          params: { groupId: item.group_id, groupName },
        });
      } else {
        router.push({
          pathname: '/detail-group',
          params: { id: item.group_id, name: groupName },
        });
      }
    } else if (item.type === 'budget_over' || item.type === 'budget_warning') {
      // พาไปที่หน้างบประมาณส่วนตัว
      router.push('/budget');
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('th-TH', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  };

  const getNotificationIconInfo = (type) => {
    switch (type) {
      case 'debt_reminder':
        return {
          icon: 'megaphone',
          color: '#EF4444',
          bg: '#FEE2E2',
          badgeText: 'ทวงเงิน',
        };
      case 'payment_confirmed':
        return {
          icon: 'checkmark-done',
          color: '#059669',
          bg: '#D1FAE5',
          badgeText: 'ได้รับเงินแล้ว',
        };
      case 'budget_over':
        return {
          icon: 'warning',
          color: '#DC2626',
          bg: '#FEE2E2',
          badgeText: 'เกินงบ',
        };
      case 'budget_warning':
        return {
          icon: 'alert-circle',
          color: '#D97706',
          bg: '#FEF3C7',
          badgeText: 'ใกล้งบ',
        };
      default:
        return {
          icon: 'notifications',
          color: '#6D28D9',
          bg: '#EDE9FE',
          badgeText: 'แจ้งเตือน',
        };
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color="#1E293B" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>การแจ้งเตือน</Text>
        <TouchableOpacity onPress={handleMarkAllRead} style={styles.readAllBtn}>
          <Text style={styles.readAllText}>อ่านทั้งหมด</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color="#6D28D9" />
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6D28D9" />
          }
        >
          {notifications.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="notifications-off-outline" size={54} color="#CBD5E1" />
              <Text style={styles.emptyTitle}>ไม่มีการแจ้งเตือน</Text>
              <Text style={styles.emptySub}>
                เมื่อมีการทวงเงิน ยืนยันรับเงินในกลุ่ม หรือการใช้จ่ายถึงงบประมาณ จะแสดงที่นี่
              </Text>
            </View>
          ) : (
            notifications.map((item) => {
              const iconInfo = getNotificationIconInfo(item.type);
              const hasAction = Boolean(item.group_id || item.type.startsWith('budget_'));

              return (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.notifCard, !item.is_read && styles.notifCardUnread]}
                  onPress={() => handlePressNotification(item)}
                  activeOpacity={0.8}
                >
                  <View style={[styles.iconCircle, { backgroundColor: iconInfo.bg }]}>
                    <Ionicons name={iconInfo.icon} size={20} color={iconInfo.color} />
                  </View>

                  <View style={styles.contentBox}>
                    <View style={styles.titleRow}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 6 }}>
                        <Text style={styles.notifTitle} numberOfLines={1}>{item.title}</Text>
                        <View style={[styles.typeBadge, { backgroundColor: iconInfo.bg }]}>
                          <Text style={[styles.typeBadgeText, { color: iconInfo.color }]}>
                            {iconInfo.badgeText}
                          </Text>
                        </View>
                      </View>
                      {!item.is_read && <View style={styles.unreadDot} />}
                    </View>

                    <Text style={styles.notifMessage}>{item.message}</Text>

                    <View style={styles.cardFooter}>
                      <Text style={styles.notifTime}>{formatDate(item.created_at)}</Text>
                      {hasAction && (
                        <View style={styles.actionHint}>
                          <Text style={styles.actionHintText}>
                            {item.group_id ? 'แตะเพื่อเข้ากลุ่ม' : 'แตะเพื่อดูงบ'}
                          </Text>
                          <Ionicons name="chevron-forward" size={12} color="#6D28D9" />
                        </View>
                      )}
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      )}
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
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  backButton: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#1E293B' },
  readAllBtn: { padding: 4 },
  readAllText: { fontSize: 13, color: '#6D28D9', fontWeight: '600' },
  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scrollContent: { padding: 16, paddingBottom: 40 },
  emptyContainer: {
    paddingVertical: 80,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#64748B',
    marginTop: 12,
  },
  emptySub: {
    fontSize: 13,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
  notifCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    ...SHADOWS.small,
  },
  notifCardUnread: {
    backgroundColor: '#FAF5FF',
    borderColor: '#DDD6FE',
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  contentBox: { flex: 1 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  notifTitle: { fontSize: 14, fontWeight: '700', color: '#1E293B', flexShrink: 1 },
  typeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#7C3AED',
    marginLeft: 6,
  },
  notifMessage: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 18,
    marginTop: 2,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  notifTime: {
    fontSize: 11,
    color: '#94A3B8',
  },
  actionHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  actionHintText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6D28D9',
  },
});
