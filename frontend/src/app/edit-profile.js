import React, { useEffect, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getCurrentUser } from '@/lib/groups';

const DEFAULT_AVATAR =
  'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=400&q=80';

const FIELDS = [
  { key: 'name', label: 'ชื่อ-นามสกุล', placeholder: 'ระบุชื่อ-นามสกุล' },
  { key: 'email', label: 'อีเมล', placeholder: 'ระบุอีเมล', keyboardType: 'email-address', autoCapitalize: 'none' },
  { key: 'phone', label: 'เบอร์โทรศัพท์', placeholder: 'ระบุเบอร์โทรศัพท์', keyboardType: 'phone-pad' },
];

export default function EditProfileScreen() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
  });
  const [avatar, setAvatar] = useState(DEFAULT_AVATAR);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const user = await getCurrentUser();
      if (!active) return;
      setForm({
        name: user?.name ?? '',
        email: user?.email ?? '',
        phone: user?.phone ?? '',
      });
      setAvatar(user?.avatar || DEFAULT_AVATAR);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const handlePickImage = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('ขอสิทธิ์เข้าถึง', 'กรุณาอนุญาตให้เข้าถึงคลังภาพเพื่อเปลี่ยนรูปโปรไฟล์');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets?.[0]?.uri) {
        setAvatar(result.assets[0].uri);
      }
    } catch (err) {
      Alert.alert('เลือกรูปไม่สำเร็จ', err.message || 'ไม่สามารถเปิดคลังภาพได้');
    }
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      Alert.alert('ข้อมูลไม่ครบถ้วน', 'กรุณาระบุชื่อ-นามสกุล');
      return;
    }

    setSaving(true);
    try {
      const user = await getCurrentUser();
      const updated = {
        ...(user || {}),
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        avatar,
      };
      await AsyncStorage.setItem('user', JSON.stringify(updated));

      Alert.alert(
        'บันทึกสำเร็จ',
        'บันทึกข้อมูลส่วนตัวไว้ในเครื่องเรียบร้อยแล้ว (ระบบยังไม่มีเซิร์ฟเวอร์เก็บโปรไฟล์)',
        [{ text: 'ตกลง', onPress: () => router.back() }]
      );
    } catch (err) {
      Alert.alert('บันทึกไม่สำเร็จ', err.message || 'ไม่สามารถบันทึกข้อมูลได้');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color="#1E293B" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>ข้อมูลส่วนตัว</Text>
          <View style={styles.backButton} />
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.avatarSection}>
            <TouchableOpacity style={styles.avatarWrapper} onPress={handlePickImage} activeOpacity={0.85}>
              <Image source={{ uri: avatar }} style={styles.avatarImage} />
              <View style={styles.cameraBadge}>
                <Ionicons name="camera" size={14} color="#FFFFFF" />
              </View>
            </TouchableOpacity>
            <TouchableOpacity onPress={handlePickImage} activeOpacity={0.8} style={{ marginTop: 8 }}>
              <Text style={styles.changeAvatarText}>เปลี่ยนรูปโปรไฟล์</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.formCard}>
            {FIELDS.map((field, index) => (
              <View key={field.key}>
                <View style={styles.fieldRow}>
                  <View style={styles.fieldTextCol}>
                    <Text style={styles.fieldLabel}>{field.label}</Text>
                    <TextInput
                      style={styles.fieldInput}
                      value={form[field.key]}
                      onChangeText={(value) => setField(field.key, value)}
                      placeholder={field.placeholder}
                      placeholderTextColor="#94A3B8"
                      keyboardType={field.keyboardType}
                      autoCapitalize={field.autoCapitalize}
                    />
                  </View>
                  <Ionicons name="create-outline" size={18} color="#7C3AED" />
                </View>
                {index < FIELDS.length - 1 && <View style={styles.fieldDivider} />}
              </View>
            ))}
          </View>

          <TouchableOpacity
            style={[styles.saveBtn, (saving || loading) && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={saving || loading}
            activeOpacity={0.85}
          >
            <Text style={styles.saveBtnText}>
              {saving ? 'กำลังบันทึก…' : 'บันทึกการเปลี่ยนแปลง'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FFFFFF' },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  backButton: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#1E293B' },

  scrollContent: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40 },

  avatarSection: { alignItems: 'center', marginBottom: 24 },
  avatarWrapper: { position: 'relative' },
  avatarImage: { width: 96, height: 96, borderRadius: 48, backgroundColor: '#E2E8F0' },
  cameraBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#6D28D9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  changeAvatarText: { fontSize: 13, color: '#6D28D9', fontWeight: '600' },

  formCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 20,
    paddingHorizontal: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  fieldRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  fieldTextCol: { flex: 1 },
  fieldLabel: { fontSize: 12, color: '#64748B', marginBottom: 4 },
  fieldInput: { fontSize: 15, color: '#1E293B', paddingVertical: 4 },
  fieldDivider: { height: 1, backgroundColor: '#E2E8F0' },

  saveBtn: { backgroundColor: '#5B21B6', borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  saveBtnDisabled: { opacity: 0.7 },
  saveBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
