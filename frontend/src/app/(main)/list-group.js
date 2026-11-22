import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  TextInput,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { SHADOWS } from '@/lib/theme';
import { getToken, http } from '@/lib/api';
import { useGroup } from '../context/GroupContext';

const baht = (n) =>
  Number(n || 0).toLocaleString('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const sameUser = (a, b) =>
  String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();

const memberNameOf = (members, id) => {
  const found = (members || []).find((m) => sameUser(m.id ?? m.user_id, id));
  return found?.name || 'สมาชิก';
};

// รวมรายการที่ต้องโอนให้คนเดียวกันในกลุ่มเดียวกัน (กันรายการซ้ำจากหลายบิล)
const mergeDebts = (items) => {
  const map = new Map();
  items.forEach((item) => {
    const key = String(item.personId ?? '').trim().toLowerCase() || 'unknown';
    if (map.has(key)) map.get(key).amount += item.amount;
    else map.set(key, { ...item, personId: key });
  });
  return Array.from(map.values());
};

// แปลงผล settlement ของ backend ให้เป็นข้อมูลที่หน้ารวม/การ์ดกลุ่มใช้แสดงผล
const buildSettlementDetail = (group, settlement, myUserId) => {
  const { balances, transactions } = settlement || {};
  const mine = (balances || []).find((b) => sameUser(b.person, myUserId));
  const pay = [];
  const receive = [];

  // transactions จาก backend คือรายการโอนจริง (from -> to) หลังหักยอดที่ยืนยันรับเงินแล้ว
  (transactions || []).forEach((t) => {
    const amount = Number(t.amount) || 0;
    if (!(amount > 0)) return;
    const from = String(t.from ?? t.from_user_id ?? '');
    const to = String(t.to ?? t.to_user_id ?? '');

    if (sameUser(from, myUserId)) {
      pay.push({ personId: to, personName: memberNameOf(group?.members, to), amount });
    } else if (sameUser(to, myUserId)) {
      receive.push({ personId: from, personName: memberNameOf(group?.members, from), amount });
    }
  });

  return {
    net: Number(mine?.amount) || 0,
    pay: mergeDebts(pay),
    receive: mergeDebts(receive),
  };
};

export default function GroupListScreen() {
  const router = useRouter();
  const { groups, me, loading, fetchSettlement, refresh } = useGroup();
  const [settlementData, setSettlementData] = useState({});
  const [confirmingKey, setConfirmingKey] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  const myUserId = String(me?.id ?? me?.user_id ?? '').trim().toLowerCase();
  const hasSettlementToLoad = Boolean(myUserId) && groups.length > 0;
  const settlementReady =
    (!loading && groups.length === 0) ||
    (hasSettlementToLoad && groups.every((g) => settlementData[g.id] !== undefined));

  useEffect(() => {
    let active = true;
    if (!myUserId || groups.length === 0) return () => { active = false; };

    Promise.all(groups.map(async (group) => {
      try {
        const settlement = await fetchSettlement(group.id);
        return [group.id, buildSettlementDetail(group, settlement, myUserId)];
      } catch {
        return [group.id, { net: 0, pay: [], receive: [] }];
      }
    })).then((entries) => {
      if (active) setSettlementData(Object.fromEntries(entries));
    });

    return () => { active = false; };
  }, [groups, myUserId, fetchSettlement]);

  const processedGroups = [...groups].sort((a, b) => {
    const newest = new Date(b.created_at || 0).getTime();
    const oldest = new Date(a.created_at || 0).getTime();
    return newest - oldest;
  }).map((g) => {
    const memberColors = (g.members || []).map((m) => m.color || '#7C3AED');
    const extraCount = Math.max(0, (g.members?.length || 0) - 4);

    const total = (g.bills || []).reduce((sum, b) => {
      return sum + (parseFloat(String(b.amount).replace(/,/g, '')) || 0);
    }, 0);

    // ใช้ยอดเดียวกับหน้าเคลียร์บิล เพื่อรองรับการหารตาม %/รายการ/ยอดตายตัว
    const detail = settlementData[g.id] || { net: 0, pay: [], receive: [] };
    const net = detail.net;

    let statusType = 'empty';
    let statusLabel = 'ยังไม่มีค่าใช้จ่าย';
    let statusAmount = 'เพิ่มรายการแรก';

    if (g.settled && total > 0) {
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
      pay: detail.pay,
      receive: detail.receive,
    };
  });

  const totalReceive = processedGroups
    .filter((g) => g.net > 0.01)
    .reduce((sum, g) => sum + g.net, 0);

  const totalDebt = processedGroups
    .filter((g) => g.net < -0.01)
    .reduce((sum, g) => sum + Math.abs(g.net), 0);

  // รวมรายการของฉันจากทุกกลุ่ม มาแสดงบนหน้ารวมโดยไม่ต้องเข้าแต่ละกลุ่ม
  const myPayList = hasSettlementToLoad
    ? processedGroups.flatMap((g) =>
        g.pay.map((p) => ({
          ...p,
          key: `pay_${g.id}_${p.personId}`,
          groupId: g.id,
          groupName: g.name,
        }))
      )
    : [];
  const myReceiveList = hasSettlementToLoad
    ? processedGroups.flatMap((g) =>
        g.receive.map((p) => ({
          ...p,
          key: `receive_${g.id}_${p.personId}`,
          groupId: g.id,
          groupName: g.name,
        }))
      )
    : [];

  // เจ้าหนี้กดยืนยันรับเงินได้เลยจากหน้ารวม (ไม่ต้องเข้าแต่ละกลุ่ม)
  const handleConfirmReceived = (item) => {
    Alert.alert(
      'ยืนยันได้รับเงินแล้ว',
      `คุณได้รับเงินจำนวน ฿${baht(item.amount)} จาก "${item.personName}" ในกลุ่ม "${item.groupName}" เรียบร้อยแล้วใช่หรือไม่?\n\nเมื่อยืนยันแล้ว ยอดหนี้รายการนี้จะถูกตัดออกจากระบบทันที`,
      [
        { text: 'ยกเลิก', style: 'cancel' },
        {
          text: 'ยืนยันได้รับเงิน',
          onPress: async () => {
            setConfirmingKey(item.key);
            try {
              const token = await getToken();
              await http.post(
                `/groups/${item.groupId}/payments/confirm`,
                { from_user: item.personId, amount: item.amount },
                { headers: { Authorization: `Bearer ${token}` } }
              );

              // โหลดยอดกลุ่มนี้ใหม่ทันที แล้วซิงก์สถานะกลุ่ม (settled) จาก context
              const group = groups.find((g) => String(g.id) === String(item.groupId));
              const settlement = await fetchSettlement(item.groupId);
              setSettlementData((prev) => ({
                ...prev,
                [item.groupId]: buildSettlementDetail(group, settlement, myUserId),
              }));
              await refresh();

              Alert.alert('สำเร็จ', `ยืนยันการรับเงินจาก "${item.personName}" เรียบร้อยแล้ว`);
            } catch (err) {
              console.error('Confirm payment error:', err);
              Alert.alert('ไม่สามารถยืนยันได้', err.response?.data?.error || err.message);
            } finally {
              setConfirmingKey(null);
            }
          },
        },
      ]
    );
  };

  const normQuery = (searchQuery || '').trim().normalize('NFC').toLowerCase();
  const queryTokens = normQuery ? normQuery.split(/\s+/).filter(Boolean) : [];
  const filteredGroups = queryTokens.length === 0
    ? processedGroups
    : processedGroups.filter((g) => {
        const name = (g.name || '').normalize('NFC').toLowerCase();
        const desc = (g.description || '').normalize('NFC').toLowerCase();
        const cat = (g.category || '').normalize('NFC').toLowerCase();
        const code = (g.invite_code || '').normalize('NFC').toLowerCase();
        const target = `${name} ${desc} ${cat} ${code}`;
        return queryTokens.every((t) => target.includes(t));
      });

  return (
    <>
      <SafeAreaView style={styles.safeArea}>
        {/* Header Bar */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarText}>
                {(me?.name || 'B').trim().charAt(0).toUpperCase() || 'B'}
              </Text>
            </View>
            <Text style={styles.headerTitle}>กลุ่มแชร์บิลของฉัน</Text>
          </View>
          <TouchableOpacity 
            style={styles.searchIconButton}
            onPress={() => setShowSearch(!showSearch)}
            activeOpacity={0.8}
          >
            <Ionicons name="search" size={20} color="#6D28D9" />
          </TouchableOpacity>
        </View>

        {/* Search Bar */}
        {showSearch && (
          <View style={styles.searchBarContainer}>
            <Ionicons name="search" size={18} color="#94A3B8" style={{ marginRight: 8 }} />
            <TextInput
              style={styles.searchBarInput}
              placeholder="ค้นหากลุ่มตามชื่อ หมวดหมู่ หรือรหัสเชิญ..."
              placeholderTextColor="#94A3B8"
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              autoFocus
            />
            {searchQuery !== '' && (
              <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close-circle" size={18} color="#94A3B8" />
              </TouchableOpacity>
            )}
          </View>
        )}

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

          {/* รวมรายการชำระของฉันจากทุกกลุ่ม (ไม่ต้องเข้าแต่ละกลุ่ม) */}
          <View style={styles.mySettleSection}>
            <View style={styles.mySettleHeader}>
              <Text style={styles.mySettleTitle}>รายการชำระของฉัน</Text>
              {!settlementReady && <ActivityIndicator size="small" color="#6D28D9" />}
            </View>

            {!settlementReady ? (
              <Text style={styles.mySettleHint}>กำลังคำนวณรายการชำระ...</Text>
            ) : myPayList.length === 0 && myReceiveList.length === 0 ? (
              <View style={styles.mySettleEmpty}>
                <Ionicons name="checkmark-circle-outline" size={20} color="#059669" />
                <Text style={styles.mySettleEmptyText}>ไม่มีรายการค้างชำระในทุกกลุ่ม</Text>
              </View>
            ) : (
              <>
                {myPayList.length > 0 && (
                  <View style={styles.mySettleBlock}>
                    <Text style={[styles.mySettleBlockTitle, { color: '#DC2626' }]}>
                      ฉันต้องจ่าย ({myPayList.length})
                    </Text>
                    {myPayList.map((item) => (
                      <View key={item.key} style={styles.mySettleRow}>
                        <View style={[styles.mySettleIconBox, styles.payIconBox]}>
                          <Ionicons name="arrow-up-circle-outline" size={16} color="#DC2626" />
                        </View>
                        <View style={styles.mySettleInfo}>
                          <Text style={styles.mySettleName}>จ่ายให้ {item.personName}</Text>
                          <Text style={styles.mySettleGroupLabel}>{item.groupName}</Text>
                        </View>
                        <Text style={[styles.mySettleAmount, { color: '#DC2626' }]}>
                          ฿{baht(item.amount)}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}

                {myReceiveList.length > 0 && (
                  <View style={styles.mySettleBlock}>
                    <Text style={[styles.mySettleBlockTitle, { color: '#059669' }]}>
                      ฉันได้รับ ({myReceiveList.length})
                    </Text>
                    {myReceiveList.map((item) => (
                      <View key={item.key} style={styles.mySettleRow}>
                        <View style={[styles.mySettleIconBox, styles.receiveIconBox]}>
                          <Ionicons name="arrow-down-circle-outline" size={16} color="#059669" />
                        </View>
                        <View style={styles.mySettleInfo}>
                          <Text style={styles.mySettleName}>รับจาก {item.personName}</Text>
                          <Text style={styles.mySettleGroupLabel}>{item.groupName}</Text>
                        </View>
                        <View style={styles.mySettleRight}>
                          <Text style={[styles.mySettleAmount, { color: '#059669' }]}>
                            ฿{baht(item.amount)}
                          </Text>
                          <TouchableOpacity
                            style={[
                              styles.confirmReceivedBtn,
                              confirmingKey !== null && styles.confirmReceivedBtnDisabled,
                            ]}
                            onPress={() => handleConfirmReceived(item)}
                            disabled={confirmingKey !== null}
                            activeOpacity={0.85}
                          >
                            {confirmingKey === item.key ? (
                              <ActivityIndicator size="small" color="#FFFFFF" />
                            ) : (
                              <Text style={styles.confirmReceivedBtnText}>ยืนยันรับเงิน</Text>
                            )}
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </>
            )}
          </View>

          {/* Action Row */}
          <View style={styles.actionRow}>
            <TouchableOpacity 
              style={styles.createBtn}
                onPress={() => router.push('/create-group')}
              activeOpacity={0.85}
            >
              <Ionicons name="add" size={18} color="#FFFFFF" style={{ marginRight: 4 }} />
              <Text style={styles.createBtnText}>สร้างกลุ่มใหม่</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.joinBtn}
                onPress={() => router.push('/join-group')}
              activeOpacity={0.85}
            >
              <Ionicons name="link-outline" size={18} color="#6D28D9" style={{ marginRight: 4 }} />
              <Text style={styles.joinBtnText}>เข้ากลุ่มด้วยโค้ด</Text>
            </TouchableOpacity>
          </View>

          {/* Section Title */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              กลุ่มทั้งหมด ({filteredGroups.length}{searchQuery ? ` / ${processedGroups.length}` : ''})
            </Text>
          </View>

            {/* Group Cards */}
            {loading && processedGroups.length === 0 ? (
              <View style={styles.emptyBox}>
                <ActivityIndicator size="large" color="#6D28D9" />
                <Text style={styles.emptyText}>กำลังโหลดกลุ่ม...</Text>
              </View>
            ) : filteredGroups.length === 0 ? (
              <View style={styles.emptyBox}>
                <Ionicons name={searchQuery ? 'search-outline' : 'people-outline'} size={44} color="#C4B5FD" />
                <Text style={styles.emptyText}>{searchQuery ? 'ไม่พบกลุ่มที่ค้นหา' : 'ยังไม่มีกลุ่ม'}</Text>
                <Text style={styles.emptyHint}>
                  {searchQuery
                    ? `ไม่พบกลุ่มที่ตรงกับ "${searchQuery}"`
                    : 'สร้างกลุ่มใหม่ หรือเข้าร่วมกลุ่มของเพื่อนด้วยรหัสเชิญ'}
                </Text>
              </View>
            ) : (
              filteredGroups.map((item) => (
            <TouchableOpacity 
              key={item.id}
              style={styles.groupCard}
                onPress={() => router.push({ pathname: '/detail-group', params: { groupId: item.id } })}
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
                item.statusType === 'empty' && styles.statusStripEmpty,
              ]}>
                <Text style={[
                  styles.statusLabel,
                  item.statusType === 'receive' && styles.statusLabelReceive,
                  item.statusType === 'debt' && styles.statusLabelDebt,
                  item.statusType === 'settled' && styles.statusLabelSettled,
                  item.statusType === 'empty' && styles.statusLabelEmpty,
                ]}>
                  {item.statusLabel}
                </Text>

                <Text style={[
                  styles.statusAmount,
                  item.statusType === 'receive' && styles.statusAmountReceive,
                  item.statusType === 'debt' && styles.statusAmountDebt,
                  item.statusType === 'settled' && styles.statusAmountSettled,
                  item.statusType === 'empty' && styles.statusAmountEmpty,
                ]}>
                  {item.statusAmount}
                </Text>
                </View>

              {/* รายการของฉันในกลุ่มนี้ (สรุปมาจาก backend เลย) */}
              {(item.pay.length > 0 || item.receive.length > 0) && (
                <View style={styles.cardDebts}>
                  {item.pay.map((p) => (
                    <View key={`pay_${p.personId}`} style={styles.cardDebtRow}>
                      <Ionicons name="arrow-up-circle-outline" size={14} color="#DC2626" />
                      <Text style={styles.cardDebtText} numberOfLines={1}>
                        จ่ายให้ {p.personName}
                      </Text>
                      <Text style={[styles.cardDebtAmount, { color: '#DC2626' }]}>
                        ฿{baht(p.amount)}
                      </Text>
                    </View>
                  ))}
                  {item.receive.map((p) => (
                    <View key={`receive_${p.personId}`} style={styles.cardDebtRow}>
                      <Ionicons name="arrow-down-circle-outline" size={14} color="#059669" />
                      <Text style={styles.cardDebtText} numberOfLines={1}>
                        รับจาก {p.personName}
                      </Text>
                      <Text style={[styles.cardDebtAmount, { color: '#059669' }]}>
                        ฿{baht(p.amount)}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
              </TouchableOpacity>
              ))
            )}
          </ScrollView>
        </SafeAreaView>
    </>
    );
  }


const styles = StyleSheet.create({
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: 32,
    gap: 8,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6D28D9',
    marginTop: 4,
  },
  emptyHint: {
    fontSize: 13,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 20,
  },
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
  searchIconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#EDE9FE',
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...SHADOWS.small,
  },
  searchBarInput: {
    flex: 1,
    fontSize: 14,
    color: '#1E293B',
    padding: 0,
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
  statusStripEmpty: {
    backgroundColor: '#F8FAFC',
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
  statusLabelEmpty: {
    color: '#64748B',
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
  statusAmountEmpty: {
    color: '#64748B',
  },

  // สรุปรายการชำระของฉันบนหน้ารวม
  mySettleSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    padding: 16,
    marginBottom: 16,
    ...SHADOWS.small,
  },
  mySettleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  mySettleTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1E293B',
  },
  mySettleHint: {
    fontSize: 13,
    color: '#94A3B8',
    paddingVertical: 6,
  },
  mySettleEmpty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
  },
  mySettleEmptyText: {
    fontSize: 13,
    color: '#059669',
  },
  mySettleBlock: {
    marginBottom: 8,
  },
  mySettleBlockTitle: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
  },
  mySettleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  mySettleIconBox: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  payIconBox: {
    backgroundColor: '#FEF2F2',
  },
  receiveIconBox: {
    backgroundColor: '#ECFDF5',
  },
  mySettleInfo: {
    flex: 1,
  },
  mySettleName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1E293B',
  },
  mySettleGroupLabel: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },
  mySettleAmount: {
    fontSize: 14,
    fontWeight: '700',
    marginLeft: 8,
  },
  mySettleRight: {
    alignItems: 'flex-end',
    marginLeft: 8,
    gap: 6,
  },
  confirmReceivedBtn: {
    minWidth: 92,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmReceivedBtnDisabled: {
    opacity: 0.7,
  },
  confirmReceivedBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },

  // รายการย่อของฉันในแต่ละการ์ดกลุ่ม
  cardDebts: {
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 6,
  },
  cardDebtRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cardDebtText: {
    flex: 1,
    fontSize: 12,
    color: '#475569',
  },
  cardDebtAmount: {
    fontSize: 12,
    fontWeight: '700',
  },
});
