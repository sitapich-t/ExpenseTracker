import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { COLORS, SHADOWS } from '../theme';
import ResponsiveWrapper from '../components/ResponsiveWrapper';
import { useGroup } from './context/GroupContext';

export default function GroupListScreen() {
  const navigation = useNavigation();
  const { groups } = useGroup();

  const processedGroups = groups.map((g) => {
    const memberColors = (g.members || []).map((m) => m.color || '#7C3AED');
    const extraCount = Math.max(0, (g.members?.length || 0) - 4);

    const total = (g.bills || []).reduce((sum, b) => {
      return sum + (parseFloat(String(b.amount).replace(/,/g, '')) || 0);
    }, 0);

    const n = g.members?.length || 1;
    const perPerson = Math.round((total / n) * 100) / 100;

    const userPaid = (g.bills || [])
      .filter((b) => b.payer === 'นนท์ (ฉัน)' || b.payer === 'ฉัน' || b.payer === 'นนท์')
      .reduce((sum, b) => sum + (parseFloat(String(b.amount).replace(/,/g, '')) || 0), 0);

    const net = userPaid - perPerson;

    let statusType = 'settled';
    let statusLabel = 'เคลียร์แล้ว';
    let statusAmount = '✓ เคลียร์แล้ว';

    if (g.settled || total === 0) {
      statusType = 'settled';
      statusLabel = 'เคลียร์แล้ว';
      statusAmount = '✓ เคลียร์แล้ว';
    } else if (net > 0.01) {
      statusType = 'receive';
      statusLabel = 'ยอดรอรับ';
      statusAmount = `+${net.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    } else if (net < -0.01) {
      statusType = 'debt';
      statusLabel = 'ยอดค้างจ่าย';
      statusAmount = `-${Math.abs(net).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    return {
      ...g,
      memberColors: memberColors.slice(0, 4),
      extraCount,
      totalBill: total.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      statusType,
      statusLabel,
      statusAmount,
      net,
    };
  });

  const totalReceive = processedGroups
    .filter((g) => !g.settled && g.net > 0.01)
    .reduce((sum, g) => sum + g.net, 0);

  const totalDebt = processedGroups
    .filter((g) => !g.settled && g.net < -0.01)
    .reduce((sum, g) => sum + Math.abs(g.net), 0);

  return (
    <ResponsiveWrapper>
      <SafeAreaView style={styles.safeArea}>
        {/* Header Bar */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarText}>B</Text>
            </View>
            <Text style={styles.headerTitle}>กลุ่มแชร์บิลของฉัน</Text>
          </View>
          <TouchableOpacity 
            style={styles.searchPill}
            onPress={() => Alert.alert('ค้นหา', 'ค้นหากลุ่มหรือสมาชิก')}
          >
            <Text style={styles.searchText}>ค้นหา</Text>
          </TouchableOpacity>
        </View>

        <ScrollView 
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Purple Summary Banner */}
          <View style={styles.summaryBanner}>
            <Text style={styles.summaryTitle}>สรุปยอดรวมของฉัน</Text>
            <View style={styles.summaryRow}>
              <View style={styles.summaryCol}>
                <Text style={styles.summaryColLabel}>ยอดรอรับทั้งหมด</Text>
                <Text style={styles.summaryColAmount}>
                  {totalReceive.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryCol}>
                <Text style={styles.summaryColLabel}>ยอดติดจ่ายทั้งหมด</Text>
                <Text style={styles.summaryColAmount}>
                  {totalDebt.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Text>
              </View>
            </View>
          </View>

          {/* Action Row */}
          <View style={styles.actionRow}>
            <TouchableOpacity 
              style={styles.createBtn}
              onPress={() => navigation.navigate('CreateGroup')}
              activeOpacity={0.85}
            >
              <Ionicons name="add" size={18} color="#FFFFFF" style={{ marginRight: 4 }} />
              <Text style={styles.createBtnText}>สร้างกลุ่มใหม่</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.joinBtn}
              onPress={() => navigation.navigate('JoinGroup')}
              activeOpacity={0.85}
            >
              <Ionicons name="link-outline" size={18} color="#6D28D9" style={{ marginRight: 4 }} />
              <Text style={styles.joinBtnText}>เข้ากลุ่มด้วยโค้ด</Text>
            </TouchableOpacity>
          </View>

          {/* Section Title */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>กลุ่มทั้งหมด ({processedGroups.length})</Text>
          </View>

          {/* Group Cards */}
          {processedGroups.map((item) => (
            <TouchableOpacity 
              key={item.id}
              style={styles.groupCard}
              onPress={() => navigation.navigate('GroupDetail', { groupId: item.id, groupName: item.name })}
              activeOpacity={0.9}
            >
              {/* Card Top */}
              <View style={styles.cardTop}>
                <Text style={styles.cardGroupName}>{item.name}</Text>
                <Ionicons name="chevron-down" size={18} color="#94A3B8" />
              </View>

              {/* Card Middle: Members Avatars & Total Bill */}
              <View style={styles.cardMiddle}>
                <View style={styles.avatarStack}>
                  {item.memberColors.map((c, i) => (
                    <View 
                      key={i} 
                      style={[
                        styles.memberDot, 
                        { backgroundColor: c, marginLeft: i > 0 ? -8 : 0, zIndex: 10 - i }
                      ]} 
                    />
                  ))}
                  {item.extraCount > 0 && (
                    <View style={[styles.memberDot, styles.memberMoreDot, { marginLeft: -8, zIndex: 5 }]}>
                      <Text style={styles.memberMoreText}>+{item.extraCount}</Text>
                    </View>
                  )}
                </View>

                <View style={styles.totalBillCol}>
                  <Text style={styles.totalBillLabel}>ยอดรวมบิลทั้งหมด</Text>
                  <Text style={styles.totalBillAmount}>{item.totalBill}</Text>
                </View>
              </View>

              {/* Card Bottom Status Strip */}
              <View style={[
                styles.statusStrip,
                item.statusType === 'receive' && styles.statusStripReceive,
                item.statusType === 'debt' && styles.statusStripDebt,
                item.statusType === 'settled' && styles.statusStripSettled,
              ]}>
                <Text style={[
                  styles.statusLabel,
                  item.statusType === 'receive' && styles.statusLabelReceive,
                  item.statusType === 'debt' && styles.statusLabelDebt,
                  item.statusType === 'settled' && styles.statusLabelSettled,
                ]}>
                  {item.statusLabel}
                </Text>

                <Text style={[
                  styles.statusAmount,
                  item.statusType === 'receive' && styles.statusAmountReceive,
                  item.statusType === 'debt' && styles.statusAmountDebt,
                  item.statusType === 'settled' && styles.statusAmountSettled,
                ]}>
                  {item.statusAmount}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
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
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#7C3AED',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  avatarText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1E293B',
  },
  searchPill: {
    backgroundColor: '#EDE9FE',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 14,
  },
  searchText: {
    color: '#6D28D9',
    fontSize: 13,
    fontWeight: '600',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 90,
  },
  summaryBanner: {
    backgroundColor: '#5B21B6',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    ...SHADOWS.medium,
  },
  summaryTitle: {
    color: '#DDD6FE',
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryCol: {
    flex: 1,
  },
  summaryColLabel: {
    color: '#C4B5FD',
    fontSize: 12,
    marginBottom: 4,
  },
  summaryColAmount: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  summaryDivider: {
    width: 1,
    height: 36,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    marginHorizontal: 12,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  createBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6D28D9',
    paddingVertical: 12,
    borderRadius: 24,
    ...SHADOWS.small,
  },
  createBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  joinBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 12,
    borderRadius: 24,
  },
  joinBtnText: {
    color: '#6D28D9',
    fontSize: 14,
    fontWeight: '700',
  },
  sectionHeader: {
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1E293B',
  },
  groupCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    marginBottom: 14,
    overflow: 'hidden',
    ...SHADOWS.small,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  cardGroupName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
  },
  cardMiddle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  avatarStack: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  memberDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  memberMoreDot: {
    backgroundColor: '#EDE9FE',
    justifyContent: 'center',
    alignItems: 'center',
  },
  memberMoreText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#6D28D9',
  },
  totalBillCol: {
    alignItems: 'flex-end',
  },
  totalBillLabel: {
    fontSize: 11,
    color: '#94A3B8',
    marginBottom: 2,
  },
  totalBillAmount: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1E293B',
  },
  statusStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  statusStripReceive: {
    backgroundColor: '#ECFDF5',
  },
  statusStripDebt: {
    backgroundColor: '#FEF2F2',
  },
  statusStripSettled: {
    backgroundColor: '#F5F3FF',
  },
  statusLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  statusLabelReceive: {
    color: '#059669',
  },
  statusLabelDebt: {
    color: '#DC2626',
  },
  statusLabelSettled: {
    color: '#6D28D9',
  },
  statusAmount: {
    fontSize: 14,
    fontWeight: '700',
  },
  statusAmountReceive: {
    color: '#059669',
  },
  statusAmountDebt: {
    color: '#DC2626',
  },
  statusAmountSettled: {
    color: '#6D28D9',
  },
});
