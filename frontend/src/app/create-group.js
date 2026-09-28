import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { SHADOWS } from '@/lib/theme';
import { useGroup } from './context/GroupContext';

const GROUP_COLORS_6 = [
  '#7C3AED', // Purple (default selected)
  '#3B82F6', // Blue
  '#10B981', // Green
  '#EC4899', // Pink
  '#F59E0B', // Orange
  '#EF4444', // Red
];

const CATEGORIES = ['ท่องเที่ยว', 'อาหารและเครื่องดื่ม', 'ที่พัก / หอพัก', 'ปาร์ตี้ สังสรรค์', 'ทั่วไป'];

// backend createGroup จดจำไอคอนจากค่า category ชุดนี้เท่านั้น
const CATEGORY_MAP = {
  'ท่องเที่ยว': 'Trip',
  'อาหารและเครื่องดื่ม': 'Food',
  'ที่พัก / หอพัก': 'Lodging',
  'ปาร์ตี้ สังสรรค์': 'Event',
  'ทั่วไป': 'General',
};

export default function CreateGroupScreen() {
  const router = useRouter();
  const { addGroup } = useGroup();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('ท่องเที่ยว');
  const [selectedColor, setSelectedColor] = useState(GROUP_COLORS_6[0]);
  const [budget, setBudget] = useState('5,000.00');
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) {
      Alert.alert('ข้อมูลไม่ครบถ้วน', 'กรุณาระบุชื่อกลุ่ม');
      return;
    }

    try {
setSaving(true);
      const created = await addGroup({
        name: name.trim(),
        description: description.trim(),
        category: CATEGORY_MAP[category] || 'General',
        color: selectedColor,
      });

      Alert.alert(
        'สร้างกลุ่มสำเร็จ! 🎉',
        `สร้างกลุ่ม "${created?.name || name}" เรียบร้อยแล้ว\nรหัสเชิญ: ${created?.invite_code || '-'}`,
        [
          {
            text: 'ตกลง',
            onPress: () => router.replace('/(main)/list-group'),
          },
        ]
      );
    } catch (err) {
      Alert.alert('สร้างกลุ่มไม่สำเร็จ', err.message || 'ไม่สามารถสร้างกลุ่มได้', [
        { text: 'ตกลง' },
      ]);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#1E293B" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>สร้างกลุ่ม</Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView 
          contentContainerStyle={styles.scrollContent} 
          showsVerticalScrollIndicator={false}
        >
          {/* Field: ชื่อกลุ่ม */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>ชื่อกลุ่ม</Text>
            <TextInput
              style={styles.textInput}
              placeholder="เช่น ทริปพัทยา 2024, ค่าไฟหอพัก"
              placeholderTextColor="#94A3B8"
              value={name}
              onChangeText={setName}
            />
          </View>

          {/* Field: คำอธิบายกลุ่ม */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>คำอธิบายกลุ่ม</Text>
            <TextInput
              style={[styles.textInput, styles.textArea]}
              placeholder="คำอธิบายอื่นๆ (ไม่บังคับ)"
              placeholderTextColor="#94A3B8"
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={3}
            />
          </View>

          {/* Field: หมวดหมู่กลุ่ม */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>หมวดหมู่กลุ่ม</Text>
            <TouchableOpacity 
              style={styles.dropdownBtn}
              onPress={() => setShowCategoryModal(true)}
              activeOpacity={0.8}
            >
              <Text style={styles.dropdownBtnText}>{category}</Text>
              <Ionicons name="chevron-down" size={18} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          {/* Field: ไอคอนและสีประจำกลุ่ม */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>ไอคอนและสีประจำกลุ่ม</Text>
            <View style={styles.colorsRow}>
              {GROUP_COLORS_6.map((color) => {
                const isSelected = selectedColor === color;
                return (
                  <TouchableOpacity
                    key={color}
                    style={[styles.colorCircle, { backgroundColor: color }]}
                    onPress={() => setSelectedColor(color)}
                    activeOpacity={0.8}
                  >
                    {isSelected && (
                      <Ionicons name="checkmark" size={18} color="#FFFFFF" />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Field: งบประมาณกลุ่ม (บาท) */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>งบประมาณกลุ่ม (บาท)</Text>
            <View style={styles.budgetInputContainer}>
              <TextInput
                style={styles.budgetInput}
                placeholder="5,000.00"
                placeholderTextColor="#94A3B8"
                value={budget}
                onChangeText={setBudget}
                keyboardType="numeric"
              />
              <Text style={styles.budgetSuffix}>บาท</Text>
            </View>
          </View>

          {/* Bottom Purple Button */}
          <TouchableOpacity
            style={[styles.submitBtn, saving && { opacity: 0.6 }]}
            onPress={handleCreate}
            activeOpacity={0.85}
            disabled={saving}
          >
            <Text style={styles.submitBtnText}>
              {saving ? 'กำลังสร้าง...' : 'สร้างกลุ่มใหม่'}
            </Text>
          </TouchableOpacity>
        </ScrollView>

        {/* Category Modal */}
        <Modal visible={showCategoryModal} transparent animationType="fade">
          <TouchableOpacity 
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setShowCategoryModal(false)}
          >
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>เลือกหมวดหมู่กลุ่ม</Text>
              {CATEGORIES.map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[styles.catOption, category === cat && styles.catOptionActive]}
                  onPress={() => {
                    setCategory(cat);
                    setShowCategoryModal(false);
                  }}
                >
                  <Text style={[styles.catOptionText, category === cat && styles.catOptionTextActive]}>
                    {cat}
                  </Text>
                  {category === cat && <Ionicons name="checkmark" size={18} color="#6D28D9" />}
                </TouchableOpacity>
              ))}
            </View>
          </TouchableOpacity>
        </Modal>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  backButton: {
    padding: 6,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1E293B',
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 40,
  },
  fieldGroup: {
    marginBottom: 20,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 8,
  },
  textInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    color: '#1E293B',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  dropdownBtn: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  dropdownBtnText: {
    fontSize: 15,
    color: '#1E293B',
    fontWeight: '500',
  },
  colorsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  colorCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  budgetInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    paddingHorizontal: 16,
  },
  budgetInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 15,
    color: '#1E293B',
  },
  budgetSuffix: {
    fontSize: 14,
    color: '#94A3B8',
    fontWeight: '500',
  },
  submitBtn: {
    backgroundColor: '#5B21B6',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 16,
    ...SHADOWS.medium,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    ...SHADOWS.medium,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 16,
    textAlign: 'center',
  },
  catOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  catOptionActive: {
    backgroundColor: '#F5F3FF',
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  catOptionText: {
    fontSize: 15,
    color: '#334155',
  },
  catOptionTextActive: {
    color: '#6D28D9',
    fontWeight: '700',
  },
});
