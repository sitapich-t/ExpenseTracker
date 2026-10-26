import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { decimalOnly } from '@/lib/inputSanitize';
import { useGroup } from './context/GroupContext';

const METHODS = { equal: 'หารเท่ากัน', percent: 'หารตามเปอร์เซ็นต์', amount: 'หารตามยอด', item: 'หารตามรายการ' };
const number = (value) => Number.parseFloat(String(value ?? '').replace(/,/g, '')) || 0;

export default function EditGroupBillScreen() {
  const router = useRouter();
  const { groupId, billId } = useLocalSearchParams();
  const { getGroup, updateGroupBillSplit } = useGroup();
  const group = getGroup(groupId);
  const bill = group?.bills?.find((entry) => String(entry.id) === String(billId));
  const members = group?.members || [];
  const ids = members.map((member) => String(member.id));
  const saved = bill?.splitData || { method: 'equal', memberIds: ids };
  const [method, setMethod] = useState(String(saved.method || 'equal'));
  const [selected, setSelected] = useState(saved.memberIds || (saved.method === 'percent' ? Object.keys(saved.shares || {}) : Object.keys(saved.amounts || {})) || ids);
  const [shares, setShares] = useState(Object.fromEntries(Object.entries(saved.shares || {}).map(([id, value]) => [id, String(value)])));
  const [amounts, setAmounts] = useState(Object.fromEntries(Object.entries(saved.amounts || {}).map(([id, value]) => [id, String(value)])));
  const [saving, setSaving] = useState(false);
  const total = number(bill?.amount);

  if (!bill) return <SafeAreaView style={styles.safe}><Text style={styles.empty}>ไม่พบบิลนี้</Text></SafeAreaView>;

  const buildSplit = () => {
    if (method === 'item') return { error: 'บิลนี้หารตามรายการสินค้า โปรดเลือกวิธีหารใหม่ หรือแก้ไขจากรายการเดิม' };
    if (!selected.length) return { error: 'กรุณาเลือกผู้ร่วมบิลอย่างน้อย 1 คน' };
    if (method === 'equal') return { data: { method, memberIds: selected } };
    const values = method === 'percent' ? shares : amounts;
    const map = Object.fromEntries(selected.map((id) => [id, number(values[id])])) ;
    const sum = Object.values(map).reduce((acc, value) => acc + value, 0);
    const expected = method === 'percent' ? 100 : total;
    if (Math.abs(sum - expected) > 0.01) return { error: method === 'percent' ? 'ผลรวมเปอร์เซ็นต์ต้องเท่ากับ 100' : `ผลรวมยอดต้องเท่ากับ ฿${total.toFixed(2)}` };
    return { data: { method, [method === 'percent' ? 'shares' : 'amounts']: map } };
  };

  const save = async () => {
    const split = buildSplit();
    if (split.error) return Alert.alert('แก้ไขไม่ได้', split.error);
    setSaving(true);
    try {
      await updateGroupBillSplit(groupId, billId, split.data);
      Alert.alert('บันทึกสำเร็จ', 'อัปเดตวิธีหารบิลแล้ว ยอดเคลียร์บิลจะถูกคำนวณใหม่', [{ text: 'ตกลง', onPress: () => router.back() }]);
    } catch (error) {
      Alert.alert('บันทึกไม่สำเร็จ', error.message || 'ไม่สามารถแก้ไขบิลได้');
    } finally { setSaving(false); }
  };

  return <SafeAreaView style={styles.safe}><View style={styles.header}><TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={26} color="#1E293B" /></TouchableOpacity><Text style={styles.title}>แก้ไขการหารบิล</Text><View /></View><ScrollView contentContainerStyle={styles.content}><View style={styles.card}><Text style={styles.bill}>{bill.title}</Text><Text style={styles.total}>฿{total.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</Text><Text style={styles.hint}>วิธีเดิม: {METHODS[String(saved.method || 'equal')]}</Text></View><View style={styles.card}><Text style={styles.label}>วิธีหารใหม่</Text><View style={styles.methods}>{['equal', 'percent', 'amount'].map((value) => <TouchableOpacity key={value} onPress={() => setMethod(value)} style={[styles.method, method === value && styles.methodActive]}><Text style={method === value && styles.methodTextActive}>{METHODS[value]}</Text></TouchableOpacity>)}</View>{members.map((member) => { const id = String(member.id); const on = selected.includes(id); return <View key={id} style={styles.row}><TouchableOpacity onPress={() => setSelected((old) => on ? old.filter((value) => value !== id) : [...old, id])}><Ionicons name={on ? 'checkbox' : 'square-outline'} size={23} color="#6D28D9" /></TouchableOpacity><Text style={styles.name}>{member.name}</Text>{method !== 'equal' && <TextInput value={(method === 'percent' ? shares : amounts)[id] || ''} onChangeText={(value) => (method === 'percent' ? setShares : setAmounts)((old) => ({ ...old, [id]: decimalOnly(value) }))} keyboardType="decimal-pad" style={styles.input} placeholder="0" />}{method !== 'equal' && <Text>{method === 'percent' ? '%' : '฿'}</Text>}</View>; })}</View><TouchableOpacity disabled={saving} onPress={save} style={styles.save}><Text style={styles.saveText}>{saving ? 'กำลังบันทึก...' : 'บันทึกวิธีหารบิล'}</Text></TouchableOpacity></ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({ safe:{flex:1,backgroundColor:'#F8FAFC'},header:{height:64,paddingHorizontal:24,alignItems:'center',justifyContent:'space-between',flexDirection:'row',backgroundColor:'#fff'},title:{fontSize:20,fontWeight:'700',color:'#1E293B'},content:{padding:20,gap:16},card:{backgroundColor:'#fff',borderRadius:18,padding:18,borderWidth:1,borderColor:'#E2E8F0'},bill:{fontSize:20,fontWeight:'700',color:'#1E293B'},total:{fontSize:28,fontWeight:'800',color:'#6D28D9',marginTop:6},hint:{color:'#64748B',marginTop:8},label:{fontWeight:'700',fontSize:16,color:'#1E293B',marginBottom:12},methods:{flexDirection:'row',gap:8,marginBottom:16},method:{borderWidth:1,borderColor:'#DDD6FE',padding:9,borderRadius:10},methodActive:{backgroundColor:'#6D28D9'},methodTextActive:{color:'#fff',fontWeight:'700'},row:{flexDirection:'row',alignItems:'center',gap:10,paddingVertical:10},name:{flex:1,color:'#334155',fontSize:16},input:{width:76,borderWidth:1,borderColor:'#CBD5E1',borderRadius:8,padding:7,textAlign:'right'},save:{backgroundColor:'#6D28D9',padding:17,borderRadius:14,alignItems:'center'},saveText:{color:'#fff',fontWeight:'700',fontSize:16},empty:{margin:30,textAlign:'center',color:'#64748B'} });
