import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { currentUserId, getCurrentUser, joinGroup } from '@/lib/groups';

export default function ScanQrCodeScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [joining, setJoining] = useState(false);

  const confirmJoin = useCallback(
    async (groupId, groupName) => {
      setJoining(true);
      try {
        const user = await getCurrentUser();
        await joinGroup(groupId, currentUserId(user));
        Alert.alert('เข้าร่วมสำเร็จ', `คุณได้เข้าร่วมกลุ่ม ${groupName || ''} แล้ว`, [
          {
            text: 'ดูรายละเอียดกลุ่ม',
            onPress: () =>
              router.replace({ pathname: '/group-detail', params: { id: groupId, name: groupName } }),
          },
        ]);
      } catch (err) {
        setScanned(false);
        Alert.alert(
          'เข้าร่วมไม่สำเร็จ',
          err.response?.data?.error || err.message || 'ไม่สามารถเข้าร่วมกลุ่มได้'
        );
      } finally {
        setJoining(false);
      }
    },
    [router]
  );

  const handleBarcodeScanned = useCallback(
    ({ data }) => {
      if (scanned || joining) return;
      setScanned(true);

      let payload;
      try {
        payload = JSON.parse(data);
      } catch {
        setScanned(false);
        Alert.alert('QR Code ไม่ถูกต้อง', 'ไม่สามารถอ่านข้อมูลจาก QR Code นี้ได้');
        return;
      }

      if (payload?.action !== 'join_group' || !payload.groupId) {
        setScanned(false);
        Alert.alert('QR Code ไม่ถูกต้อง', 'QR Code นี้ไม่ใช่คำเชิญเข้าร่วมกลุ่ม');
        return;
      }

      Alert.alert(
        'เข้าร่วมกลุ่ม',
        `ต้องการเข้าร่วมกลุ่ม "${payload.groupName || payload.groupId}" ใช่หรือไม่?`,
        [
          { text: 'ยกเลิก', style: 'cancel', onPress: () => setScanned(false) },
          {
            text: 'เข้าร่วม',
            onPress: () => confirmJoin(payload.groupId, payload.groupName),
          },
        ]
      );
    },
    [scanned, joining, confirmJoin]
  );

  if (!permission) {
    return (
      <SafeAreaView style={styles.dark}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#21D07A" />
          <Text style={styles.darkText}>กำลังขอสิทธิ์การใช้งานกล้อง…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.dark}>
        <View style={styles.centered}>
          <Ionicons name="camera-outline" size={44} color="#21D07A" />
          <Text style={styles.darkText}>
            แอปต้องการสิทธิ์การใช้งานกล้องเพื่อสแกน QR Code เข้าร่วมกลุ่ม
          </Text>
          <TouchableOpacity style={styles.grantBtn} onPress={requestPermission}>
            <Text style={styles.grantBtnText}>อนุญาตการใช้งานกล้อง</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.grantBtn, styles.cancelBtn]}
            onPress={() => router.back()}
          >
            <Text style={styles.grantBtnText}>ยกเลิก</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.dark}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>สแกน QR Code</Text>
        <View style={styles.backBtn} />
      </View>

      <View style={styles.cameraContainer}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          onBarcodeScanned={scanned || joining ? undefined : handleBarcodeScanned}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        />
        <View style={styles.overlay}>
          <View style={styles.scanFrame} />
          <Text style={styles.instruction}>
            เล็ง QR Code ให้อยู่ในกรอบเพื่อเข้าร่วมกลุ่ม
          </Text>
        </View>
      </View>

      {joining ? (
        <View style={styles.rescanBtn}>
          <ActivityIndicator color="#FFFFFF" />
          <Text style={styles.rescanText}>กำลังเข้าร่วมกลุ่ม…</Text>
        </View>
      ) : (
        scanned && (
          <TouchableOpacity style={styles.rescanBtn} onPress={() => setScanned(false)}>
            <Text style={styles.rescanText}>แตะเพื่อสแกนอีกครั้ง</Text>
          </TouchableOpacity>
        )
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  dark: { flex: 1, backgroundColor: '#060A13' },

  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 16 },
  darkText: { color: '#FFFFFF', fontSize: 16, textAlign: 'center' },
  grantBtn: { backgroundColor: '#21D07A', paddingVertical: 15, paddingHorizontal: 24, borderRadius: 12, width: '100%', alignItems: 'center' },
  grantBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  cancelBtn: { backgroundColor: '#1E293B' },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(30,41,59,0.8)', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#FFFFFF' },

  cameraContainer: { flex: 1 },
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.45)' },
  scanFrame: { width: 250, height: 250, borderWidth: 2, borderColor: '#21D07A', borderRadius: 12 },
  instruction: { color: '#FFFFFF', fontSize: 15, marginTop: 40, textAlign: 'center', backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, overflow: 'hidden' },

  rescanBtn: {
    position: 'absolute',
    bottom: 40,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#21D07A',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 24,
  },
  rescanText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
