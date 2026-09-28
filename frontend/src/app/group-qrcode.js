import React, { useState } from 'react';
import {
  Alert,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';

export default function GroupQrCodeScreen() {
  const router = useRouter();
  const { id, name, code } = useLocalSearchParams();
  const [sharing, setSharing] = useState(false);

  const groupId = Array.isArray(id) ? id[0] : id;
  const groupName = (Array.isArray(name) ? name[0] : name) || 'กลุ่ม';
  const inviteCode = (Array.isArray(code) ? code[0] : code) || '';

  if (!groupId) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Header onBack={() => router.back()} title="QR Code เข้ากลุ่ม" />
        <View style={styles.centered}>
          <Ionicons name="alert-circle-outline" size={40} color="#DC2626" />
          <Text style={styles.errorText}>ไม่พบรหัสกลุ่ม กรุณากลับไปหน้ากลุ่มแล้วลองใหม่</Text>
        </View>
      </SafeAreaView>
    );
  }

  const qrValue = JSON.stringify({ action: 'join_group', groupId, groupName });

  const handleShare = async () => {
    try {
      setSharing(true);
      await Share.share({
        message: `เชิญเข้าร่วมกลุ่ม "${groupName}" ใน Expense Tracker\nรหัสกลุ่ม: ${groupId}`,
      });
    } catch (err) {
      Alert.alert('แชร์ไม่สำเร็จ', err.message || 'ไม่สามารถเปิดหน้าต่างแชร์ได้');
    } finally {
      setSharing(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <Header onBack={() => router.back()} title="QR Code เข้ากลุ่ม" />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <View style={styles.iconHeader}>
            <Ionicons name="people" size={28} color="#6D28D9" />
          </View>
          <Text style={styles.title}>{groupName}</Text>
          <Text style={styles.subtitle}>
            ให้เพื่อนสแกน QR Code นี้เพื่อเข้าร่วมกลุ่ม
          </Text>

          <View style={styles.qrWrapper}>
            <QRCode
              value={qrValue}
              size={220}
              color="#1E293B"
              backgroundColor="#ffffff"
            />
          </View>

          <View style={styles.codeBox}>
            <Text style={styles.codeLabel}>หรือให้เพื่อนกรอกรหัสกลุ่ม</Text>
            <Text style={styles.codeValue} selectable>
              {inviteCode || groupId}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.shareBtn, sharing && styles.shareBtnDisabled]}
          onPress={handleShare}
          disabled={sharing}
          activeOpacity={0.85}
        >
          <Ionicons name="share-social-outline" size={20} color="#FFFFFF" />
          <Text style={styles.shareText}>
            {sharing ? 'กำลังแชร์…' : 'แชร์คำเชิญให้เพื่อน'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function Header({ onBack, title }) {
  return (
    <View style={styles.header}>
      <TouchableOpacity style={styles.backBtn} onPress={onBack}>
        <Ionicons name="chevron-back" size={24} color="#1E293B" />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>{title}</Text>
      <View style={styles.backBtn} />
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F8FAFC' },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#1E293B' },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  errorText: { fontSize: 14, color: '#64748B', textAlign: 'center' },

  content: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 16, paddingBottom: 40 },

  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    width: '100%',
    maxWidth: 360,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    marginBottom: 20,
  },
  iconHeader: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#F5F3FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: { fontSize: 22, fontWeight: '700', color: '#1E293B', marginBottom: 6, textAlign: 'center' },
  subtitle: { fontSize: 14, color: '#64748B', marginBottom: 20, textAlign: 'center' },

  qrWrapper: {
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
  },
  codeBox: {
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    width: '100%',
  },
  codeLabel: { fontSize: 12, color: '#94A3B8', marginBottom: 2 },
  codeValue: { fontSize: 15, fontWeight: '700', color: '#6D28D9', letterSpacing: 1, textAlign: 'center' },

  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#5B21B6',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 16,
    width: '100%',
    maxWidth: 360,
  },
  shareBtnDisabled: { opacity: 0.7 },
  shareText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
});
