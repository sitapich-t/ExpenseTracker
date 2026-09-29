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
import { getToken, http } from '@/lib/api';
import { useGroup } from './context/GroupContext';

export default function JoinGroupScreen() {
  const router = useRouter();
  const { refresh } = useGroup();
  const [inviteCode, setInviteCode] = useState('');
  const [looking, setLooking] = useState(false);
  const [joining, setJoining] = useState(false);
  const [found, setFound] = useState(null);

  const authHeaders = async () => {
    const token = await getToken();
    return token ? { headers: { Authorization: `Bearer ${token}` } } : {};
  };

  // ขั้นที่ 1: เอารหัสเชิญไปหากลุ่ม (ยังไม่เข้าร่วม)
  const lookup = async () => {
    const code = String(inviteCode || '').trim().toUpperCase();
    if (!code) {
      Alert.alert('กรุณากรอกรหัสเชิญ', 'รหัสเชิญจะอยู่ในหน้า QR Code ของกลุ่ม');
      return;
    }

    setLooking(true);
    setFound(null);
    try {
      const res = await http.get(`/groups/invite/${encodeURIComponent(code)}`, await authHeaders());
      if (!res.data?.success) throw new Error(res.data?.error || 'ไม่พบกลุ่มจากรหัสนี้');
      setFound({ ...res.data.group, already_member: !!res.data.already_member });
    } catch (err) {
      Alert.alert(
        'ไม่พบกลุ่ม',
        err.response?.data?.error || err.message || 'ไม่สามารถค้นหากลุ่มได้'
      );
    } finally {
      setLooking(false);
    }
  };

  // ขั้นที่ 2: เข้าร่วมด้วยตัวเอง (backend รับ user จาก token เสมอ)
  const runJoin = async () => {
    if (!found?.id) return;
    setJoining(true);
    try {
      const res = await http.post(
        '/groups/join',
        { group_id: found.id },
        await authHeaders()
      );
      if (!res.data?.success) throw new Error(res.data?.error || 'เข้าร่วมกลุ่มไม่สำเร็จ');

      setInviteCode('');
      setFound(null);
      // ดึงรายชื่อกลุ่มใหม่ก่อน ไม่งั้นหน้า detail จะหาไม่เจอ
      await refresh();
      Alert.alert('เข้าร่วมกลุ่มสำเร็จ', 'คุณได้เข้าร่วมกลุ่มเรียบร้อยแล้ว', [
        {
          text: 'ดูรายละเอียดกลุ่ม',
          onPress: () => router.replace({ pathname: '/detail-group', params: { groupId: found.id } }),
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
            onPress={() => router.push('/scan-qr-group')}
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
          <Text style={styles.cardTitle}>ใส่รหัสเชิญที่ได้รับ</Text>

          <TextInput
            style={styles.codeInput}
            placeholder="พิมพ์รหัสเชิญ เช่น GR829A"
            placeholderTextColor="#94A3B8"
            value={inviteCode}
            onChangeText={(t) => {
              setInviteCode(t);
              setFound(null);
            }}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={12}
          />

          <TouchableOpacity
            style={[styles.joinBtn, looking && styles.joinBtnDisabled]}
            onPress={lookup}
            disabled={looking}
            activeOpacity={0.85}
          >
            {looking ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.joinBtnText}>ค้นหากลุ่ม</Text>
            )}
          </TouchableOpacity>

          {/* ผลลัพธ์การค้นหา: ต้องกดเข้าร่วมอีกครั้งเพื่อกันเข้ากลุ่มผิดโดยไม่ตั้งใจ */}
          {found && (
            <View style={styles.resultBox}>
              <View style={styles.resultHeader}>
                <Ionicons name="people" size={20} color="#5B21B6" />
                <Text style={styles.resultName} numberOfLines={1}>
                  {found.name}
                </Text>
              </View>
              <Text style={styles.resultMeta}>
                สมาชิก {found.members_count ?? 1} คน
                {found.category ? ` • ${found.category}` : ''}
              </Text>

              {found.already_member ? (
                <TouchableOpacity
                  style={[styles.joinBtn, styles.mutedBtn]}
                  onPress={() => router.replace({ pathname: '/detail-group', params: { groupId: found.id } })}
                  activeOpacity={0.85}
                >
                  <Text style={styles.joinBtnText}>คุณอยู่ในกลุ่มนี้อยู่แล้ว — ดูรายละเอียด</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.joinBtn, joining && styles.joinBtnDisabled]}
                  onPress={runJoin}
                  disabled={joining}
                  activeOpacity={0.85}
                >
                  {joining ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.joinBtnText}>เข้าร่วมกลุ่มนี้</Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
          )}
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
  mutedBtn: { backgroundColor: '#64748B', marginTop: 4 },
  joinBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },

  resultBox: {
    width: '100%',
    marginTop: 16,
    padding: 16,
    borderRadius: 14,
    backgroundColor: '#F5F3FF',
    borderWidth: 1,
    borderColor: '#DDD6FE',
  },
  resultHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  resultName: { flex: 1, fontSize: 16, fontWeight: '700', color: '#1E293B' },
  resultMeta: { fontSize: 13, color: '#6D28D9', marginTop: 4, marginBottom: 12 },
});
