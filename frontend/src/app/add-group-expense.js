import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import {
  currentUserId,
  displayNameFor,
  fetchGroupBundle,
  formatBaht,
  getCurrentUser,
  memberColor,
  parseAmount,
} from '@/lib/groups';
import { getToken, http } from '@/lib/api';

const CATEGORIES = [
  { id: 'Food', label: 'อาหาร', icon: 'restaurant-outline' },
  { id: 'Transport', label: 'เดินทาง', icon: 'car-outline' },
  { id: 'House', label: 'ที่พัก', icon: 'home-outline' },
  { id: 'Entertain', label: 'บันเทิง', icon: 'game-controller-outline' },
  { id: 'General', label: 'อื่นๆ', icon: 'ellipsis-horizontal-outline' },
];

export default function AddGroupExpenseScreen() {
  const router = useRouter();
  const { id, name } = useLocalSearchParams();

  const groupId = Array.isArray(id) ? id[0] : id;
  const groupName = (Array.isArray(name) ? name[0] : name) || 'กลุ่ม';

  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('Food');
  const [payerId, setPayerId] = useState(null);
  const [members, setMembers] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPayerModal, setShowPayerModal] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        try {
          const user = await getCurrentUser();
          const bundle = await fetchGroupBundle(groupId);
          if (!active) return;
          setCurrentUser(user);
          setMembers(bundle.members);
          setPayerId((prev) => prev ?? currentUserId(user));
        } catch (err) {
          if (active) {
            Alert.alert(
              'โหลดข้อมูลไม่สำเร็จ',
              err.response?.data?.error || err.message || 'ไม่สามารถโหลดสมาชิกกลุ่มได้'
            );
          }
        } finally {
          if (active) setLoading(false);
        }
      })();
      return () => {
        active = false;
      };
    }, [groupId])
  );

  const numAmount = parseAmount(amount);
  const splitCount = members.length || 1;
  const perPerson = numAmount / splitCount;

  const payerLabel = useMemo(() => {
    const found = members.find((m) => String(m.user_id) === String(payerId));
    if (found) return displayNameFor(found.user_id, currentUser);
    return currentUser?.name ? `${currentUser.name} (ฉัน)` : 'ฉัน';
  }, [members, payerId, currentUser]);

  const handleSave = async () => {
    if (!title.trim() || numAmount <= 0) {
      Alert.alert('ข้อมูลไม่ครบถ้วน', 'กรุณากรอกชื่อรายการและยอดเงิน');
      return;
    }
    if (!groupId) {
      Alert.alert('ข้อผิดพลาด', 'ไม่พบรหัสกลุ่ม');
      return;
    }

    setSaving(true);
    try {
      const token = await getToken();
      const res = await http.post(
        `/groups/${groupId}/transactions`,
        {
          title: title.trim(),
          type: 'expense',
          amount: numAmount,
          category,
          merchant: 'General',
          paid_by: payerId || currentUserId(currentUser),
        },
        { headers: token ? { Authorization: `Bearer ${token}` } : {} }
      );

      if (!res.data?.success) {
        throw new Error(res.data?.error || 'บันทึกไม่สำเร็จ');
      }

      Alert.alert(
        'บันทึกสำเร็จ',
        `บันทึกรายการ "${title.trim()}" ฿${formatBaht(numAmount)} เข้ากลุ่มเรียบร้อยแล้ว`,
        [{ text: 'ตกลง', onPress: () => router.back() }]
      );
    } catch (err) {
      Alert.alert(
        'บันทึกไม่สำเร็จ',
        err.response?.data?.error || err.message || 'ไม่สามารถบันทึกรายการได้'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#1E293B" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>กรอกข้อมูลรายการ</Text>
        <View style={styles.backButton} />
      </View>

      <View style={styles.groupBanner}>
        <Ionicons name="people" size={16} color="#6D28D9" />
        <Text style={styles.groupBannerText} numberOfLines={1}>
          บันทึกค่าใช้จ่ายในกลุ่ม: {groupName}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.card}>
          <Text style={styles.cardHeaderTitle}>รายละเอียดค่าใช้จ่าย</Text>

          <Text style={styles.inputLabel}>ชื่อรายการค่าใช้จ่าย</Text>
          <TextInput
            style={styles.textInput}
            placeholder="เช่น ค่าอาหาร, ค่าน้ำมัน"
            placeholderTextColor="#94A3B8"
            value={title}
            onChangeText={setTitle}
          />

          <Text style={[styles.inputLabel, { marginTop: 14 }]}>ยอดเงินทั้งหมด (บาท)</Text>
          <View style={styles.amountInputContainer}>
            <TextInput
              style={styles.amountInput}
              placeholder="0.00"
              placeholderTextColor="#94A3B8"
              value={amount}
              onChangeText={setAmount}
              keyboardType="numeric"
            />
          </View>

          <Text style={[styles.inputLabel, { marginTop: 14, marginBottom: 8 }]}>หมวดหมู่</Text>
          <View style={styles.categoryRow}>
            {CATEGORIES.map((cat) => {
              const isSelected = category === cat.id;
              return (
                <TouchableOpacity
                  key={cat.id}
                  style={[styles.catPill, isSelected && styles.catPillActive]}
                  onPress={() => setCategory(cat.id)}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name={cat.icon}
                    size={14}
                    color={isSelected ? '#6D28D9' : '#64748B'}
                    style={{ marginRight: 4 }}
                  />
                  <Text style={[styles.catPillText, isSelected && styles.catPillTextActive]}>
                    {cat.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardHeaderTitle}>คนจ่ายเงินหลัก</Text>

          <TouchableOpacity
            style={styles.payerSelector}
            onPress={() => members.length > 0 && setShowPayerModal(true)}
            activeOpacity={0.8}
          >
            <View style={styles.payerLeft}>
              <View style={styles.payerAvatar}>
                <Text style={styles.payerAvatarText}>{payerLabel.charAt(0) || '฿'}</Text>
              </View>
              <Text style={styles.payerName} numberOfLines={1}>
                {payerLabel}
              </Text>
            </View>
            {members.length > 0 && (
              <Ionicons name="chevron-down" size={18} color="#94A3B8" />
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardHeaderTitle}>
            ผู้ร่วมหารบิล ({members.length} คน)
          </Text>

          {loading ? (
            <ActivityIndicator color="#6D28D9" style={{ marginVertical: 12 }} />
          ) : members.length === 0 ? (
            <Text style={styles.emptyHint}>ยังไม่มีสมาชิกในกลุ่มนี้</Text>
          ) : (
            <>
              <View style={styles.splitBanner}>
                <Ionicons name="calculator-outline" size={16} color="#059669" />
                <Text style={styles.splitBannerText}>
                  หารเท่ากัน: คนละ ฿{formatBaht(perPerson)}
                </Text>
              </View>

              {members.map((member, index) => (
                <View key={member.id ?? member.user_id ?? index} style={styles.memberSplitRow}>
                  <View style={styles.memberLeft}>
                    <View
                      style={[styles.memberDot, { backgroundColor: memberColor(index) }]}
                    />
                    <Text style={styles.memberSplitName} numberOfLines={1}>
                      {displayNameFor(member.user_id, currentUser)}
                    </Text>
                  </View>
                  <Text style={styles.perPersonAmount}>
                    {numAmount > 0 ? `฿${formatBaht(perPerson)}` : '—'}
                  </Text>
                </View>
              ))}
            </>
          )}
        </View>

        <TouchableOpacity
          style={[styles.submitBtn, saving && styles.submitBtnDisabled]}
          onPress={handleSave}
          disabled={saving || loading}
          activeOpacity={0.85}
        >
          {saving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.submitBtnText}>ยืนยันและบันทึก</Text>
          )}
        </TouchableOpacity>

        <View style={{ height: 24 }} />
      </ScrollView>

      <Modal visible={showPayerModal} transparent animationType="fade">
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowPayerModal(false)}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>เลือกคนจ่ายเงินหลัก</Text>
            {members.map((member, index) => (
              <TouchableOpacity
                key={member.id ?? member.user_id ?? index}
                style={styles.modalOption}
                onPress={() => {
                  setPayerId(member.user_id);
                  setShowPayerModal(false);
                }}
              >
                <View style={[styles.memberDot, { backgroundColor: memberColor(index) }]} />
                <Text style={styles.modalOptionText} numberOfLines={1}>
                  {displayNameFor(member.user_id, currentUser)}
                </Text>
                {String(member.user_id) === String(payerId) && (
                  <Ionicons name="checkmark" size={18} color="#6D28D9" />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
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
  backButton: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#1E293B' },

  groupBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F5F3FF',
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  groupBannerText: { flex: 1, fontSize: 13, color: '#6D28D9', fontWeight: '600' },

  scrollContent: { paddingHorizontal: 16, paddingTop: 16 },

  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  cardHeaderTitle: { fontSize: 14, fontWeight: '700', color: '#1E293B', marginBottom: 12 },

  inputLabel: { fontSize: 13, color: '#64748B', marginBottom: 6 },
  textInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: '#1E293B',
  },
  amountInputContainer: {
    borderWidth: 1.5,
    borderColor: '#6D28D9',
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  amountInput: { fontSize: 26, fontWeight: '800', color: '#1E293B' },

  categoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  catPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  catPillActive: { backgroundColor: '#F5F3FF', borderColor: '#6D28D9' },
  catPillText: { fontSize: 13, color: '#64748B' },
  catPillTextActive: { color: '#6D28D9', fontWeight: '700' },

  payerSelector: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  payerLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  payerAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#10B981', justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  payerAvatarText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  payerName: { flex: 1, fontSize: 15, fontWeight: '600', color: '#1E293B' },

  splitBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    marginBottom: 12,
  },
  splitBannerText: { fontSize: 13, color: '#059669', fontWeight: '600' },

  memberSplitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  memberLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  memberDot: { width: 12, height: 12, borderRadius: 6, marginRight: 10 },
  memberSplitName: { flex: 1, fontSize: 14, color: '#1E293B', fontWeight: '500' },
  perPersonAmount: { fontSize: 14, fontWeight: '600', color: '#64748B', marginLeft: 8 },

  emptyHint: { fontSize: 13, color: '#94A3B8', textAlign: 'center', paddingVertical: 12 },

  submitBtn: { backgroundColor: '#5B21B6', borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  submitBtnDisabled: { opacity: 0.7 },
  submitBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalCard: { width: '100%', backgroundColor: '#FFFFFF', borderRadius: 20, padding: 20 },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#1E293B', marginBottom: 16, textAlign: 'center' },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalOptionText: { flex: 1, fontSize: 15, color: '#1E293B' },
});
