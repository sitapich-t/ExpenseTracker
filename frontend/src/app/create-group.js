import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

const API_BASE_URL = (global.__API_URL__ || 'http://192.168.1.45:3000') + '/api/v1';

const CATEGORIES = [
  { id: 'Trip', label: 'Trip', icon: 'airplane-outline' },
  { id: 'House', label: 'House', icon: 'home-outline' },
  { id: 'Food', label: 'Food', icon: 'restaurant-outline' },
  { id: 'Event', label: 'Event', icon: 'party-popper' }, // Icon จาก MaterialCommunityIcons
];

export default function CreateGroupScreen() {
  const router = useRouter();
  const [groupName, setGroupName] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Trip');
  const [loading, setLoading] = useState(false);

  const handleCreateGroup = async () => {
    if (!groupName.trim()) {
      Alert.alert('แจ้งเตือน', 'กรุณากรอกชื่อกลุ่ม');
      return;
    }

    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('userToken');

      // ยิง API สร้างกลุ่มใหม่
      const res = await axios.post(
        `${API_BASE_URL}/groups/create`,
        {
          name: groupName,
          category: selectedCategory,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      Alert.alert(
        'สร้างกลุ่มสำเร็จ!',
        'ระบบสร้าง QR Code สำหรับเชิญเพื่อนเข้ากลุ่มเรียบร้อยแล้ว',
        [
          {
            text: 'ตกลง',
            onPress: () => {
              // ส่งไปยังหน้าแสดงรายละเอียดกลุ่มพร้อมส่ง QR Code / Invite ID ไปด้วย
              router.replace({
                pathname: '/group-detail',
                params: {
                  id: res.data?.group?.id || '1',
                  name: groupName,
                  showQRModal: 'true',
                },
              });
            },
          },
        ]
      );
    } catch (err) {
      Alert.alert('ข้อผิดพลาด', err.response?.data?.error || 'ไม่สามารถสร้างกลุ่มได้');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#6d28d9" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Create Group</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
        {/* Section 1: Group Details */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Group Details</Text>

          <Text style={styles.inputLabel}>Group Name</Text>
          <TextInput
            style={styles.textInput}
            placeholder="e.g. Ski Trip 2024"
            placeholderTextColor="#a1a1aa"
            value={groupName}
            onChangeText={setGroupName}
          />

          <Text style={styles.inputLabel}>Category</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryRow}>
            {CATEGORIES.map((item) => {
              const isSelected = selectedCategory === item.id;
              return (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.categoryBtn, isSelected && styles.categoryBtnActive]}
                  onPress={() => setSelectedCategory(item.id)}
                  activeOpacity={0.7}
                >
                  {item.id === 'Event' ? (
                    <MaterialCommunityIcons
                      name={item.icon}
                      size={24}
                      color={isSelected ? '#6d28d9' : '#4b5563'}
                    />
                  ) : (
                    <Ionicons
                      name={item.icon}
                      size={24}
                      color={isSelected ? '#6d28d9' : '#4b5563'}
                    />
                  )}
                  <Text style={[styles.categoryText, isSelected && styles.categoryTextActive]}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Section 2: Invite Option (แทนที่ส่วน Search/Add Members) */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Add Members</Text>
          <View style={styles.qrInfoBox}>
            <View style={styles.qrIconCircle}>
              <Ionicons name="qr-code-outline" size={28} color="#6d28d9" />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.qrInfoTitle}>Invite via QR Code / Link</Text>
              <Text style={styles.qrInfoSub}>
                เมื่อสร้างกลุ่มเสร็จแล้ว ระบบจะสร้าง QR Code และลิงก์เชิญให้เพื่อนของคุณสแกนเข้าร่วมกลุ่มได้ด้วยตัวเอง
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Footer Submit Button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.submitBtn}
          onPress={handleCreateGroup}
          disabled={loading}
          activeOpacity={0.8}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitBtnText}>Create Group</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', paddingTop: 50 },
  
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justify: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#1e1b4b' },

  // Card Container
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    marginHorizontal: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
  },
  cardTitle: { fontSize: 18, fontWeight: '700', color: '#1e1b4b', marginBottom: 16 },

  // Inputs & Categories
  inputLabel: { fontSize: 13, fontWeight: '600', color: '#64748b', marginBottom: 8 },
  textInput: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd6fe',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: '#0f172a',
    marginBottom: 20,
  },
  categoryRow: { flexDirection: 'row', paddingVertical: 4 },
  categoryBtn: {
    width: 76,
    height: 80,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 16,
    justify: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  categoryBtnActive: {
    backgroundColor: '#f3e8ff',
    borderColor: '#6d28d9',
    borderWidth: 1.5,
  },
  categoryText: { fontSize: 12, fontWeight: '600', color: '#4b5563', marginTop: 6 },
  categoryTextActive: { color: '#6d28d9', fontWeight: '700' },

  // Invite Section
  qrInfoBox: {
    flexDirection: 'row',
    backgroundColor: '#f5f3ff',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd6fe',
  },
  qrIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#fff',
    justify: 'center',
    alignItems: 'center',
  },
  qrInfoTitle: { fontSize: 14, fontWeight: '700', color: '#5b21b6', marginBottom: 4 },
  qrInfoSub: { fontSize: 12, color: '#6b21a8', lineHeight: 17 },

  // Footer Button
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 28,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  submitBtn: {
    backgroundColor: '#6d28d9',
    borderRadius: 25,
    paddingVertical: 16,
    alignItems: 'center',
    elevation: 3,
    shadowColor: '#6d28d9',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});