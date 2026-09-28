import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { currentUserId, getCurrentUser, joinGroup } from '@/lib/groups';

export default function JoinGroupScreen() {
  const router = useRouter();
  const [inviteCode, setInviteCode] = useState('');
  const [joining, setJoining] = useState(false);

  const runJoin = async (groupId) => {
    const code = String(groupId ?? '').trim();
    if (!code) {
      Alert.alert('กรุณากรอกรหัสกลุ่ม', 'รหัสกลุ่มจะอยู่ในหน้า QR Code เข้ากลุ่ม');
      return;
    }

    setJoining(true);
    try {
      const user = await getCurrentUser();
      await joinGroup(code, currentUserId(user));
      setInviteCode('');
      Alert.alert('เข้าร่วมกลุ่มสำเร็จ', 'คุณได้เข้าร่วมกลุ่มเรียบร้อยแล้ว', [
        {
          text: 'ดูรายละเอียดกลุ่ม',
          onPress: () => router.replace({ pathname: '/group-detail', params: { id: code } }),
        },
      ]);
    } catch (err) {
      Alert.alert(
        'เข้าร่วมไม่สำเร็จ',
        err.response?.data?.error || err.message || 'ไม่สามารถเข้าร่วมกลุ่มได้'
      );
    } finally {
      setJoining(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#1E293B" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>เข้าร่วมกลุ่ม</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <Text style={styles.cardTitle}>สแกน QR Code เพื่อเข้ากลุ่ม</Text>

          <TouchableOpacity
            style={styles.scannerContainer}
            onPress={() => router.push('/scan-qrcode')}
            activeOpacity={0.9}
          >
            <View style={[styles.corner, styles.topLeft]} />
            <View style={[styles.corner, styles.topRight]} />
            <View style={[styles.corner, styles.bottomLeft]} />
            <View style={[styles.corner, styles.bottomRight]} />
            <View style={styles.qrGraphic}>
              <Ionicons name="qr-code" size={90} color="#1E293B" />
            </View>
          </TouchableOpacity>

          <Text style={styles.scannerSubtext}>
            แตะเพื่อเปิดกล้องสแกน QR Code ของหัวหน้ากลุ่ม
          </Text>
        </View>

        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>หรือ</Text>
          <View style={styles.dividerLine} />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>ใส่รหัสกลุ่มที่ได้รับ</Text>

          <TextInput
            style={styles.codeInput}
            placeholder="พิมพ์รหัสกลุ่ม"
            placeholderTextColor="#94A3B8"
            value={inviteCode}
            onChangeText={setInviteCode}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <TouchableOpacity
            style={[styles.joinBtn, joining && styles.joinBtnDisabled]}
            onPress={() => runJoin(inviteCode)}
            disabled={joining}
            activeOpacity={0.85}
          >
            {joining ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.joinBtnText}>เข้าร่วมกลุ่มทันที</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
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
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#1E293B' },

  scrollContent: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40 },

  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#1E293B', marginBottom: 20, textAlign: 'center' },

  scannerContainer: { width: 200, height: 200, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  corner: { position: 'absolute', width: 28, height: 28, borderColor: '#7C3AED' },
  topLeft: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 6 },
  topRight: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 6 },
  bottomLeft: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 6 },
  bottomRight: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 6 },
  qrGraphic: { width: 140, height: 140, backgroundColor: '#F8FAFC', borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  scannerSubtext: { fontSize: 13, color: '#94A3B8', textAlign: 'center' },

  dividerRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 20 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#E2E8F0' },
  dividerText: { fontSize: 14, color: '#94A3B8', paddingHorizontal: 16 },

  codeInput: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: '#1E293B',
    marginBottom: 16,
    textAlign: 'center',
  },
  joinBtn: {
    width: '100%',
    backgroundColor: '#5B21B6',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  joinBtnDisabled: { opacity: 0.7 },
  joinBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
