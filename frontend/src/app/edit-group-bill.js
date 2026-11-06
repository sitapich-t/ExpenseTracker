import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { decimalOnly } from '@/lib/inputSanitize';
import { useGroup } from './context/GroupContext';

const METHODS = { equal: 'หารเท่ากัน', percent: 'หารตามเปอร์เซ็นต์', amount: 'หารตามยอด', item: 'หารตามรายการ' };
const number = (value) => Number.parseFloat(String(value ?? '').replace(/,/g, '')) || 0;
const round2 = (n) => Math.round(n * 100) / 100;

export default function EditGroupBillScreen() {
  const router = useRouter();
  const { groupId, billId } = useLocalSearchParams();
  const { getGroup, updateGroupBillSplit } = useGroup();
  const group = getGroup(groupId);
  const bill = group?.bills?.find((entry) => String(entry.id) === String(billId));
  const members = group?.members || [];
  const ids = members.map((member) => String(member.id ?? member.user_id));
  const saved = bill?.splitData || bill?.split_data || { method: 'equal', memberIds: ids };
  const [method, setMethod] = useState(String(saved.method || 'equal'));
  const [selected, setSelected] = useState(
    saved.memberIds ||
      (saved.method === 'percent' ? Object.keys(saved.shares || {}) : Object.keys(saved.amounts || {})) ||
      ids
  );
  const [shares, setShares] = useState(
    Object.fromEntries(Object.entries(saved.shares || {}).map(([id, value]) => [id, String(value)]))
  );
  const [amounts, setAmounts] = useState(
    Object.fromEntries(Object.entries(saved.amounts || {}).map(([id, value]) => [id, String(value)]))
  );
  const [items, setItems] = useState(
    Array.isArray(saved.items)
      ? saved.items.map((it, i) => ({
          key: `edit_${i}`,
          name: it.name || it.id || `รายการ ${i + 1}`,
          price: String(it.price ?? ''),
          sharedBy: Array.isArray(it.sharedBy) ? it.sharedBy.map(String) : [],
        }))
      : []
  );
  const [saving, setSaving] = useState(false);
  const total = number(bill?.amount);
  const subtotal = number(bill?.subtotal) || total;

  if (!bill) return <SafeAreaView style={styles.safe}><Text style={styles.empty}>ไม่พบบิลนี้</Text></SafeAreaView>;

  const buildSplit = () => {
    if (!selected.length && method !== 'item') return { error: 'กรุณาเลือกผู้ร่วมบิลอย่างน้อย 1 คน' };
    if (method === 'equal') return { data: { method, memberIds: selected } };
    if (method === 'percent') {
      const values = shares;
      const map = Object.fromEntries(selected.map((id) => [id, number(values[id])]));
      const sum = Object.values(map).reduce((acc, value) => acc + value, 0);
      if (Math.abs(sum - 100) > 0.01) return { error: 'ผลรวมเปอร์เซ็นต์ต้องเท่ากับ 100' };
      return { data: { method, memberIds: selected, shares: map } };
    }
    if (method === 'amount') {
      const values = amounts;
      const map = Object.fromEntries(selected.map((id) => [id, number(values[id])]));
      const sum = Object.values(map).reduce((acc, value) => acc + value, 0);
      if (Math.abs(sum - total) > 0.01) return { error: `ผลรวมยอดต้องเท่ากับ ฿${total.toFixed(2)}` };
      return { data: { method, memberIds: selected, amounts: map } };
    }
    if (method === 'item') {
      const clean = items
        .filter((it) => (it.name || '').trim() || number(it.price) > 0 || (it.sharedBy || []).length > 0)
        .map((it, i) => ({
          id: (it.name || '').trim() || `item_${i + 1}`,
          price: number(it.price),
          sharedBy: (it.sharedBy || []).map(String),
        }));
      if (clean.length === 0) return { error: 'กรุณาเพิ่มรายการสินค้าอย่างน้อย 1 รายการ' };
      const noShare = clean.find((it) => it.sharedBy.length === 0);
      if (noShare) return { error: `รายการ "${noShare.id}" ต้องเลือกว่าใครร่วมกินอย่างน้อย 1 คน` };
      const priceSum = round2(clean.reduce((s, it) => s + it.price, 0));
      if (Math.abs(priceSum - round2(subtotal > 0 ? subtotal : total)) > 0.01) {
        return { error: `ผลรวมราคาสินค้า (${priceSum.toFixed(2)}) ต้องเท่ากับยอดก่อนภาษี (${(subtotal > 0 ? subtotal : total).toFixed(2)})` };
      }
      return { data: { method: 'item', items: clean } };
    }
    return { error: 'วิธีหารไม่ถูกต้อง' };
  };

  const save = async () => {
    const split = buildSplit();
    if (split.error) return Alert.alert('แก้ไขไม่ได้', split.error);
    setSaving(true);
    try {
      await updateGroupBillSplit(groupId, billId, split.data);
      Alert.alert('บันทึกสำเร็จ', 'อัปเดตวิธีหารบิลแล้ว ยอดเคลียร์บิลจะถูกคำนวณใหม่', [
        { text: 'ตกลง', onPress: () => router.back() },
      ]);
    } catch (error) {
      Alert.alert('บันทึกไม่สำเร็จ', error.message || 'ไม่สามารถแก้ไขบิลได้');
    } finally {
      setSaving(false);
    }
  };

  const toggleMember = (id) => {
    setSelected((old) => (old.includes(id) ? old.filter((value) => value !== id) : [...old, id]));
  };

  const toggleItemMember = (itemKey, memberId) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.key !== itemKey) return it;
        const list = (it.sharedBy || []).map(String);
        if (list.includes(memberId)) {
          return { ...it, sharedBy: list.filter((x) => x !== memberId) };
        }
        return { ...it, sharedBy: [...list, memberId] };
      })
    );
  };

  const addItem = () => {
    setItems((prev) => [...prev, { key: `new_${Date.now()}`, name: '', price: '', sharedBy: ids.length ? ids : selected }]);
  };

  const removeItem = (itemKey) => {
    setItems((prev) => prev.filter((it) => it.key !== itemKey));
  };

  const updateItem = (itemKey, field, value) => {
    setItems((prev) => prev.map((it) => (it.key === itemKey ? { ...it, [field]: value } : it)));
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={26} color="#1E293B" />
        </TouchableOpacity>
        <Text style={styles.title}>แก้ไขการหารบิล</Text>
        <View />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.bill}>{bill.title}</Text>
          <Text style={styles.total}>฿{total.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</Text>
          <Text style={styles.hint}>วิธีเดิม: {METHODS[String(saved.method || 'equal')]}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>วิธีหารใหม่</Text>
          <View style={styles.methods}>
            {['equal', 'percent', 'amount', 'item'].map((value) => (
              <TouchableOpacity
                key={value}
                onPress={() => setMethod(value)}
                style={[styles.method, method === value && styles.methodActive]}
              >
                <Text style={method === value && styles.methodTextActive}>{METHODS[value]}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {method !== 'item' && (
            <>
              <Text style={styles.subLabel}>ผู้ร่วมบิล</Text>
              {members.map((member) => {
                const id = String(member.id ?? member.user_id);
                const on = selected.includes(id);
                return (
                  <View key={id} style={styles.row}>
                    <TouchableOpacity onPress={() => toggleMember(id)}>
                      <Ionicons name={on ? 'checkbox' : 'square-outline'} size={23} color="#6D28D9" />
                    </TouchableOpacity>
                    <Text style={styles.name}>{member.name || member.email || 'สมาชิก'}</Text>
                    {method !== 'equal' && (
                      <>
                        <TextInput
                          value={(method === 'percent' ? shares : amounts)[id] || ''}
                          onChangeText={(value) =>
                            (method === 'percent' ? setShares : setAmounts)((old) => ({ ...old, [id]: decimalOnly(value) }))
                          }
                          keyboardType="decimal-pad"
                          style={styles.input}
                          placeholder="0"
                        />
                        <Text>{method === 'percent' ? '%' : '฿'}</Text>
                      </>
                    )}
                  </View>
                );
              })}
            </>
          )}

          {method === 'item' && (
            <>
              <Text style={styles.subLabel}>รายการสินค้า/บริการ</Text>
              <Text style={styles.hintSmall}>กำหนดว่าแต่ละรายการ ใครต้องหารบ้าง (ยอดก่อนภาษี: ฿{(subtotal > 0 ? subtotal : total).toFixed(2)})</Text>
              {items.map((it) => (
                <View key={it.key} style={styles.itemCard}>
                  <View style={styles.itemHeader}>
                    <TextInput
                      style={styles.itemNameInput}
                      value={it.name}
                      onChangeText={(v) => updateItem(it.key, 'name', v)}
                      placeholder="ชื่อรายการ"
                      placeholderTextColor="#94A3B8"
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    <TextInput
                      style={styles.itemPriceInput}
                      value={it.price}
                      onChangeText={(v) => updateItem(it.key, 'price', decimalOnly(v))}
                      keyboardType="decimal-pad"
                      placeholder="ราคา"
                    />
                    <TouchableOpacity onPress={() => removeItem(it.key)}>
                      <Ionicons name="trash-outline" size={20} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.shareLabel}>ใครต้องหารรายการนี้</Text>
                  <View style={styles.shareRow}>
                    {members.map((member) => {
                      const mid = String(member.id ?? member.user_id);
                      const on = (it.sharedBy || []).map(String).includes(mid);
                      return (
                        <TouchableOpacity
                          key={mid}
                          onPress={() => toggleItemMember(it.key, mid)}
                          style={[styles.shareChip, on && styles.shareChipActive]}
                        >
                          <Text style={[styles.shareChipText, on && styles.shareChipTextActive]}>
                            {member.name || member.email || mid.slice(0, 6)}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              ))}
              <TouchableOpacity style={styles.addItemBtn} onPress={addItem}>
                <Ionicons name="add-circle-outline" size={20} color="#6D28D9" />
                <Text style={styles.addItemText}>เพิ่มรายการ</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        <TouchableOpacity disabled={saving} onPress={save} style={styles.save}>
          <Text style={styles.saveText}>{saving ? 'กำลังบันทึก...' : 'บันทึกวิธีหารบิล'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { height: 64, paddingHorizontal: 24, alignItems: 'center', justifyContent: 'space-between', flexDirection: 'row', backgroundColor: '#fff' },
  title: { fontSize: 20, fontWeight: '700', color: '#1E293B' },
  content: { padding: 20, gap: 16 },
  card: { backgroundColor: '#fff', borderRadius: 18, padding: 18, borderWidth: 1, borderColor: '#E2E8F0' },
  bill: { fontSize: 20, fontWeight: '700', color: '#1E293B' },
  total: { fontSize: 28, fontWeight: '800', color: '#6D28D9', marginTop: 6 },
  hint: { color: '#64748B', marginTop: 8 },
  hintSmall: { color: '#64748B', marginBottom: 12, fontSize: 12 },
  label: { fontWeight: '700', fontSize: 16, color: '#1E293B', marginBottom: 12 },
  subLabel: { fontWeight: '700', fontSize: 14, color: '#1E293B', marginBottom: 8, marginTop: 4 },
  methods: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  method: { borderWidth: 1, borderColor: '#DDD6FE', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10 },
  methodActive: { backgroundColor: '#6D28D9' },
  methodTextActive: { color: '#fff', fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  name: { flex: 1, color: '#334155', fontSize: 15 },
  input: { width: 76, borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 8, padding: 7, textAlign: 'right' },
  save: { backgroundColor: '#6D28D9', padding: 17, borderRadius: 14, alignItems: 'center', marginBottom: 40 },
  saveText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  empty: { margin: 30, textAlign: 'center', color: '#64748B' },
  itemCard: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, padding: 12, marginBottom: 12, backgroundColor: '#F8FAFC' },
  itemHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemNameInput: { flex: 1, borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 8, padding: 8, backgroundColor: '#fff' },
  itemPriceInput: { width: 90, borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 8, padding: 8, textAlign: 'right', backgroundColor: '#fff' },
  shareLabel: { marginTop: 10, marginBottom: 8, color: '#475569', fontSize: 13 },
  shareRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  shareChip: { borderWidth: 1, borderColor: '#DDD6FE', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  shareChipActive: { backgroundColor: '#6D28D9', borderColor: '#6D28D9' },
  shareChipText: { color: '#475569', fontSize: 12 },
  shareChipTextActive: { color: '#fff', fontWeight: '600' },
  addItemBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 10 },
  addItemText: { color: '#6D28D9', fontWeight: '600' },
});
