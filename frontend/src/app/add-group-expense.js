import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
import { useGroup } from './context/GroupContext';

// expo-router ส่ง param เป็น string เสมอ (ถ้าเป็น array ให้เอาตัวแรก)
const scalar = (v) => (Array.isArray(v) ? v[0] : v);

const CATEGORIES = [
  { id: 'Food', label: 'อาหาร', icon: 'restaurant-outline' },
  { id: 'Transport', label: 'เดินทาง', icon: 'car-outline' },
  { id: 'House', label: 'ที่พัก', icon: 'home-outline' },
  { id: 'Entertain', label: 'บันเทิง', icon: 'game-controller-outline' },
  { id: 'General', label: 'อื่นๆ', icon: 'ellipsis-horizontal-outline' },
];

// 3 เคสการหารบิล (เคสที่ 3 มี 2 แบบย่อย)
const SPLIT_METHODS = [
  { id: 'equal', label: 'หารเท่ากัน', icon: 'people-outline' },
  { id: 'percent', label: 'ตาม %', icon: 'pie-chart-outline' },
  { id: 'item', label: 'ตามรายการ', icon: 'list-outline' },
  { id: 'amount', label: 'ตามยอด', icon: 'cash-outline' },
];

const round2 = (n) => Math.round(n * 100) / 100;
const toNum = (v) => {
  const n = parseFloat(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};

export default function AddGroupExpenseScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { addGroupBill } = useGroup();

  // detail-group ส่ง groupId/groupName (รองรับ id/name ด้วยเผื่อลิงก์เก่า)
  const groupId = scalar(params.groupId ?? params.id);
  const groupName = scalar(params.groupName ?? params.name) || 'กลุ่ม';

  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('Food');
  const [payerId, setPayerId] = useState(null);
  const [members, setMembers] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPayerModal, setShowPayerModal] = useState(false);

  // วิธีหารบิล: equal | percent | item | amount
  const [splitMethod, setSplitMethod] = useState('equal');
  // equal: ใครร่วมบิลบ้าง
  const [selectedIds, setSelectedIds] = useState([]);
  // percent: { memberId: '30' }  (เก็บเป็น string เพื่อให้พิมพ์คั่นวรรคได้)
  const [shares, setShares] = useState({});
  // amount: { memberId: '120' }
  const [amounts, setAmounts] = useState({});
  // item: [{ key, name, price, sharedBy: [memberId] }]
  const [items, setItems] = useState([]);

  const memberIds = useMemo(
    () => members.map((m) => m.user_id ?? m.id).filter(Boolean).map(String),
    [members]
  );

  // โหลดสมาชิกเสร็จ -> เริ่มเป็น "ทุกคน" สำหรับการหารเท่ากัน
  const initSplitDefaults = useCallback((list) => {
    const ids = (list || []).map((m) => m.user_id ?? m.id).filter(Boolean).map(String);
    if (ids.length === 0) return;

    setSelectedIds((prev) => (prev.length > 0 ? prev.filter((id) => ids.includes(id)) : ids));
    setShares((prev) => {
      if (Object.keys(prev).length > 0) return prev;
      // เปอร์เซ็นต์เริ่มต้นหารเท่ากัน (ปัดให้รวมได้ 100 พอดี)
      const each = round2(100 / ids.length);
      const init = {};
      ids.forEach((id, i) => {
        init[id] = i === ids.length - 1 ? String(round2(100 - each * i)) : String(each);
      });
      return init;
    });
  }, []);

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

  const payerLabel = useMemo(() => {
    const found = members.find((m) => String(m.user_id) === String(payerId));
    if (found) return displayNameFor(found.user_id, currentUser);
    return currentUser?.name ? `${currentUser.name} (ฉัน)` : 'ฉัน';
  }, [members, payerId, currentUser]);

  // ยอด % รวม — ใช้แสดงผลและเช็คก่อนบันทึก
  const percentTotal = useMemo(
    () => round2(Object.values(shares).reduce((s, v) => s + toNum(v), 0)),
    [shares]
  );

  // สร้าง split_data ตามวิธีที่เลือก + เช็คเงื่อนไขก่อนส่ง
  // คืน { error } ถ้าข้อมูลไม่ครบ มิฉะนั้น { data }
  const buildSplitData = useCallback(() => {
    if (splitMethod === 'equal') {
      if (selectedIds.length === 0) {
        return { error: 'กรุณาเลือกอย่างน้อย 1 คนที่ร่วมหารบิล' };
      }
      return { data: { method: 'equal', memberIds: selectedIds } };
    }

    if (splitMethod === 'percent') {
      const map = {};
      let sum = 0;
      for (const id of selectedIds.length > 0 ? selectedIds : memberIds) {
        const pct = toNum(shares[id]);
        if (pct < 0) return { error: 'เปอร์เซ็นต์ต้องไม่ติดลบ' };
        map[id] = pct;
        sum += pct;
      }
      if (Object.keys(map).length === 0) {
        return { error: 'กรุณาเลือกอย่างน้อย 1 คนที่ร่วมหารบิล' };
      }
      if (Math.abs(round2(sum) - 100) > 0.01) {
        return { error: `ผลรวมเปอร์เซ็นต์ต้องเท่ากับ 100 (ตอนนี้ ${round2(sum)})` };
      }
      return { data: { method: 'percent', shares: map } };
    }

    if (splitMethod === 'amount') {
      const map = {};
      let sum = 0;
      for (const id of selectedIds.length > 0 ? selectedIds : memberIds) {
        const v = toNum(amounts[id]);
        if (v < 0) return { error: 'ยอดต้องไม่ติดลบ' };
        map[id] = v;
        sum += v;
      }
      if (Object.keys(map).length === 0) {
        return { error: 'กรุณาเลือกอย่างน้อย 1 คนที่ร่วมหารบิล' };
      }
      if (Math.abs(round2(sum) - round2(numAmount)) > 0.01) {
        return {
          error: `ผลรวมยอดที่กรอก (${formatBaht(round2(sum))}) ต้องเท่ากับยอดบิล (${formatBaht(round2(numAmount))})`,
        };
      }
      return { data: { method: 'amount', amounts: map } };
    }

    // item-based: ต้องมีรายการ และราคารวมต้องตรงกับยอดบิล
    const clean = items
      .filter((it) => (it.name || '').trim() || toNum(it.price) > 0 || it.sharedBy.length > 0)
      .map((it, i) => ({
        id: (it.name || '').trim() || `item_${i + 1}`,
        price: toNum(it.price),
        sharedBy: it.sharedBy.map(String),
      }));

    if (clean.length === 0) {
      return { error: 'กรุณาเพิ่มรายการสินค้าอย่างน้อย 1 รายการ' };
    }
    const noShare = clean.find((it) => it.sharedBy.length === 0);
    if (noShare) {
      return { error: `รายการ "${noShare.id}" ต้องเลือกว่าใครร่วมกินอย่างน้อย 1 คน` };
    }
    const priceSum = round2(clean.reduce((s, it) => s + it.price, 0));
    if (Math.abs(priceSum - round2(numAmount)) > 0.01) {
      return {
        error: `ผลรวมราคาสินค้า (${formatBaht(priceSum)}) ต้องเท่ากับยอดบิล (${formatBaht(round2(numAmount))})`,
      };
    }
    return { data: { method: 'item', items: clean } };
  }, [splitMethod, selectedIds, memberIds, shares, amounts, items, numAmount]);

  // ยอดที่แต่ละคนจะโดน (preview) — คำนวณเบื้องต้นบนเครื่อง
  const previewRows = useMemo(() => {
    const total = round2(numAmount);
    if (total <= 0) return [];

    const nameOf = (id) => {
      const m = members.find((x) => String(x.user_id) === String(id));
      return m ? displayNameFor(m.user_id, currentUser) : 'สมาชิก';
    };

    if (splitMethod === 'equal') {
      const ids = selectedIds.length > 0 ? selectedIds : memberIds;
      if (ids.length === 0) return [];
      const per = round2(total / ids.length);
      return ids.map((id) => ({ id, name: nameOf(id), value: per, unit: 'เท่ากัน' }));
    }

    if (splitMethod === 'percent') {
      const ids = selectedIds.length > 0 ? selectedIds : memberIds;
      const sum = ids.reduce((s, id) => s + toNum(shares[id]), 0);
      if (ids.length === 0) return [];
      return ids.map((id) => ({
        id,
        name: nameOf(id),
        value: round2((total * toNum(shares[id])) / (sum || 100)),
        unit: `${toNum(shares[id])}%`,
      }));
    }

    if (splitMethod === 'amount') {
      const ids = selectedIds.length > 0 ? selectedIds : memberIds;
      if (ids.length === 0) return [];
      return ids.map((id) => ({ id, name: nameOf(id), value: round2(toNum(amounts[id])), unit: 'บาท' }));
    }

    // item: ราคาที่แต่ละคนโดน = ราคารายการที่เขาแชร์ หารกันในรายการนั้น
    const out = {};
    items.forEach((it) => {
      const p = toNum(it.price);
      const n = it.sharedBy.length;
      if (n === 0 || p <= 0) return;
      const per = p / n;
      it.sharedBy.forEach((sid) => {
        const k = String(sid);
        out[k] = (out[k] || 0) + per;
      });
    });
    return Object.entries(out).map(([id, v]) => ({
      id,
      name: nameOf(id),
      value: round2(v),
      unit: 'ตามของที่กิน',
    }));
  }, [splitMethod, numAmount, selectedIds, memberIds, shares, amounts, items, members, currentUser]);

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
      // เช็คสัดส่วนก่อนยิง API — backend ก็ validate ซ้ำอีกชั้น แต่รู้เร็วกว่าและข้อความชัดกว่า
      const split = buildSplitData();
      if (split.error) {
        Alert.alert('สัดส่วนไม่ครบถ้วน', split.error);
        return;
      }

      const result = await addGroupBill(groupId, {
        title: title.trim(),
        type: 'expense',
        amount: numAmount,
        category,
        payer: payerId || currentUserId(currentUser),
        payerName: payerLabel,
        // วิธีหาร: equal | percent | item | amount
        splitData: split.data,
      });

      // บันทึกบิลสำเร็จ แต่บางข้อมูลยังบันทึกไม่ได้ (ฐานข้อมูลยังไม่มีคอลัมน์) -> ต้องเตือน
      if (result && result.splitSaved === false) {
        const dropped = (result.droppedFields || []).join(', ');
        Alert.alert(
          'บันทึกบิลแล้ว แต่ข้อมูลบางส่วนไม่ครบ',
          `บันทึกรายการ "${title.trim()}" ฿${formatBaht(numAmount)} แล้ว\n\n` +
            `ยังบันทึกไม่ได้: ${dropped || 'ข้อมูลบางส่วน'}\n` +
            'เพราะฐานข้อมูลยังไม่มีคอลัมน์เหล่านี้ (ต้องรัน migration)\n' +
            'ยอดรวมของกลุ่มจึงอาจไม่ตรงกับที่ควรเป็น',
          [{ text: 'ตกลง', onPress: () => router.back() }]
        );
        return;
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
          <Text style={styles.cardHeaderTitle}>วิธีหารบิล</Text>

          <View style={styles.methodRow}>
            {SPLIT_METHODS.map((m) => {
              const isSelected = splitMethod === m.id;
              return (
                <TouchableOpacity
                  key={m.id}
                  style={[styles.methodPill, isSelected && styles.methodPillActive]}
                  onPress={() => setSplitMethod(m.id)}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name={m.icon}
                    size={13}
                    color={isSelected ? '#6D28D9' : '#64748B'}
                    style={{ marginRight: 4 }}
                  />
                  <Text style={[styles.methodPillText, isSelected && styles.methodPillTextActive]}>
                    {m.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {loading ? (
            <ActivityIndicator color="#6D28D9" style={{ marginVertical: 12 }} />
          ) : members.length === 0 ? (
            <Text style={styles.emptyHint}>ยังไม่มีสมาชิกในกลุ่มนี้</Text>
          ) : (
            <>
              {/* เลือกว่าใครร่วมบิลนี้ (equal / percent / amount) */}
              {splitMethod !== 'item' && (
                <View style={styles.memberPickSection}>
                  <Text style={styles.sectionHint}>ผู้ร่วมบิลนี้ (แตะเพื่อเลือก/เอาออก)</Text>
                  {members.map((member, index) => {
                    const id = String(member.user_id ?? member.id);
                    const on = selectedIds.includes(id);
                    return (
                      <TouchableOpacity
                        key={id}
                        style={styles.memberPickRow}
                        onPress={() =>
                          setSelectedIds((prev) =>
                            prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
                          )
                        }
                        activeOpacity={0.8}
                      >
                        <View
                          style={[
                            styles.checkbox,
                            on && { backgroundColor: memberColor(index), borderColor: memberColor(index) },
                          ]}
                        >
                          {on && <Ionicons name="checkmark" size={12} color="#FFFFFF" />}
                        </View>
                        <Text style={styles.memberPickName} numberOfLines={1}>
                          {displayNameFor(member.user_id, currentUser)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {/* percent: ช่องกรอก % */}
              {splitMethod === 'percent' && (
                <View style={styles.amountInputsSection}>
                  {members.map((member, index) => {
                    const id = String(member.user_id ?? member.id);
                    return (
                      <View key={id} style={styles.inputRow}>
                        <View style={[styles.memberDot, { backgroundColor: memberColor(index) }]} />
                        <Text style={styles.inputRowName} numberOfLines={1}>
                          {displayNameFor(member.user_id, currentUser)}
                        </Text>
                        <TextInput
                          style={styles.smallInput}
                          value={shares[id] ?? ''}
                          onChangeText={(v) => setShares((p) => ({ ...p, [id]: v }))}
                          keyboardType="decimal-pad"
                          placeholder="0"
                          placeholderTextColor="#94A3B8"
                        />
                        <Text style={styles.inputUnit}>%</Text>
                      </View>
                    );
                  })}
                  <Text
                    style={[
                      styles.totalHint,
                      { color: Math.abs(percentTotal - 100) <= 0.01 ? '#059669' : '#DC2626' },
                    ]}
                  >
                    รวม {percentTotal}% {Math.abs(percentTotal - 100) <= 0.01 ? '(ถูกต้อง)' : '(ต้องเท่ากับ 100%)'}
                  </Text>
                </View>
              )}

              {/* amount: ช่องกรอกยอดตายตัว */}
              {splitMethod === 'amount' && (
                <View style={styles.amountInputsSection}>
                  {members.map((member, index) => {
                    const id = String(member.user_id ?? member.id);
                    return (
                      <View key={id} style={styles.inputRow}>
                        <View style={[styles.memberDot, { backgroundColor: memberColor(index) }]} />
                        <Text style={styles.inputRowName} numberOfLines={1}>
                          {displayNameFor(member.user_id, currentUser)}
                        </Text>
                        <TextInput
                          style={styles.smallInput}
                          value={amounts[id] ?? ''}
                          onChangeText={(v) => setAmounts((p) => ({ ...p, [id]: v }))}
                          keyboardType="decimal-pad"
                          placeholder="0.00"
                          placeholderTextColor="#94A3B8"
                        />
                        <Text style={styles.inputUnit}>฿</Text>
                      </View>
                    );
                  })}
                  <Text style={styles.totalHint}>
                    ยอดบิลทั้งหมด ฿{formatBaht(numAmount)} — ผลรวมต้องเท่ากัน
                  </Text>
                </View>
              )}

              {/* item: รายการสินค้า + ใครกินอะไร */}
              {splitMethod === 'item' && (
                <View style={styles.itemSection}>
                  {items.map((it, idx) => (
                    <View key={it.key} style={styles.itemCard}>
                      <View style={styles.itemHeadRow}>
                        <TextInput
                          style={styles.itemNameInput}
                          value={it.name}
                          onChangeText={(v) =>
                            setItems((p) => p.map((x, i) => (i === idx ? { ...x, name: v } : x)))
                          }
                          placeholder={`รายการที่ ${idx + 1}`}
                          placeholderTextColor="#94A3B8"
                        />
                        <TextInput
                          style={styles.itemPriceInput}
                          value={it.price}
                          onChangeText={(v) =>
                            setItems((p) => p.map((x, i) => (i === idx ? { ...x, price: v } : x)))
                          }
                          keyboardType="decimal-pad"
                          placeholder="0.00"
                          placeholderTextColor="#94A3B8"
                        />
                        <Text style={styles.inputUnit}>฿</Text>
                        <TouchableOpacity
                          onPress={() => setItems((p) => p.filter((_, i) => i !== idx))}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Ionicons name="trash-outline" size={17} color="#EF4444" />
                        </TouchableOpacity>
                      </View>

                      <Text style={styles.sectionHint}>ใครร่วมกินรายการนี้</Text>
                      <View style={styles.itemMemberRow}>
                        {members.map((member, mi) => {
                          const id = String(member.user_id ?? member.id);
                          const on = it.sharedBy.map(String).includes(id);
                          return (
                            <TouchableOpacity
                              key={id}
                              style={[
                                styles.itemMemberChip,
                                on && { backgroundColor: memberColor(mi), borderColor: memberColor(mi) },
                              ]}
                              onPress={() =>
                                setItems((p) =>
                                  p.map((x, i) =>
                                    i === idx
                                      ? {
                                          ...x,
                                          sharedBy: on
                                            ? x.sharedBy.filter((y) => String(y) !== id)
                                            : [...x.sharedBy, id],
                                        }
                                      : x
                                  )
                                )
                              }
                              activeOpacity={0.8}
                            >
                              <Text
                                style={[styles.itemMemberChipText, on && { color: '#FFFFFF' }]}
                                numberOfLines={1}
                              >
                                {displayNameFor(member.user_id, currentUser)}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  ))}

                  <TouchableOpacity
                    style={styles.addItemBtn}
                    onPress={() =>
                      setItems((p) => [
                        ...p,
                        { key: `${Date.now()}_${p.length}`, name: '', price: '', sharedBy: [] },
                      ])
                    }
                    activeOpacity={0.8}
                  >
                    <Ionicons name="add-circle-outline" size={16} color="#6D28D9" />
                    <Text style={styles.addItemBtnText}>เพิ่มรายการสินค้า</Text>
                  </TouchableOpacity>

                  <Text style={styles.totalHint}>
                    ยอดบิลทั้งหมด ฿{formatBaht(numAmount)} — ผลรวมราคาสินค้าต้องเท่ากัน
                  </Text>
                </View>
              )}

              {/* พรีวิวว่าใครโดนเท่าไร */}
              {previewRows.length > 0 && (
                <View style={styles.splitBanner}>
                  <Ionicons name="calculator-outline" size={16} color="#059669" />
                  <Text style={styles.splitBannerText} numberOfLines={2}>
                    {previewRows.map((r) => `${r.name} ฿${formatBaht(r.value)}`).join('  ·  ')}
                  </Text>
                </View>
              )}
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

  methodRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  methodPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  methodPillActive: { backgroundColor: '#F5F3FF', borderColor: '#6D28D9' },
  methodPillText: { fontSize: 12, color: '#64748B' },
  methodPillTextActive: { color: '#6D28D9', fontWeight: '700' },

  memberPickSection: { marginBottom: 12 },
  sectionHint: { fontSize: 11, color: '#94A3B8', marginBottom: 6, marginTop: 4 },
  memberPickRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7 },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberPickName: { flex: 1, fontSize: 14, color: '#1E293B' },

  amountInputsSection: { marginTop: 4, marginBottom: 12 },
  inputRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7 },
  inputRowName: { flex: 1, fontSize: 14, color: '#1E293B' },
  smallInput: {
    width: 84,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 14,
    color: '#1E293B',
    textAlign: 'right',
  },
  inputUnit: { width: 22, fontSize: 13, color: '#94A3B8', marginLeft: 6 },
  totalHint: { fontSize: 12, color: '#64748B', marginTop: 8, fontWeight: '600' },

  itemSection: { marginBottom: 12 },
  itemCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    marginBottom: 10,
  },
  itemHeadRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  itemNameInput: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 14,
    color: '#1E293B',
  },
  itemPriceInput: {
    width: 76,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 7,
    fontSize: 14,
    color: '#1E293B',
    textAlign: 'right',
  },
  itemMemberRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  itemMemberChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  itemMemberChipText: { fontSize: 12, color: '#64748B' },
  addItemBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#C4B5FD',
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingVertical: 10,
  },
  addItemBtnText: { fontSize: 13, color: '#6D28D9', fontWeight: '600' },

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
