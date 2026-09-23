import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  SafeAreaView,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { SHADOWS } from '../theme';
import ResponsiveWrapper from '../components/ResponsiveWrapper';

export default function JoinGroupScreen() {
  const navigation = useNavigation();
  const [inviteCode, setInviteCode] = useState('');

  const handleJoinByCode = () => {
    if (!inviteCode.trim()) {
      Alert.alert('กรุณากรอกรหัสกลุ่ม', 'ตัวอย่าง: GR-829A');
      return;
    }

    Alert.alert(
      'เข้าร่วมกลุ่มสำเร็จ! 🎉',
      `คุณได้เข้าร่วมกลุ่มด้วยรหัส "${inviteCode.toUpperCase()}" เรียบร้อยแล้ว`,
      [
        {
          text: 'ไปยังหน้ารายละเอียดกลุ่ม',
          onPress: () => {
            navigation.navigate('GroupDetail', {
              groupId: 'new_group',
              groupName: 'กลุ่มจากรหัสคำเชิญ',
            });
          },
        },
      ]
    );
  };

  const handleSimulateScan = () => {
    Alert.alert(
      'พบกลุ่มจาก QR Code! 📸',
      'คุณต้องการเข้าร่วม "ทริปหัวหิน 2026 🏖️" ใช่หรือไม่?',
      [
        { text: 'ยกเลิก', style: 'cancel' },
        {
          text: 'เข้าร่วมกลุ่ม',
          onPress: () => {
            navigation.navigate('GroupDetail', {
              groupId: '1',
              groupName: 'ทริปหัวหิน 2026 🏖️',
            });
          },
        },
      ]
    );
  };

  return (
    <ResponsiveWrapper>
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#1E293B" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>เข้าร่วมกลุ่ม</Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView 
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Top Card: QR Code Scanner */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>สแกน QR Code เพื่อเข้ากลุ่ม</Text>

            <TouchableOpacity 
              style={styles.scannerContainer}
              onPress={handleSimulateScan}
              activeOpacity={0.9}
            >
              {/* Corner brackets */}
              <View style={[styles.corner, styles.topLeft]} />
              <View style={[styles.corner, styles.topRight]} />
              <View style={[styles.corner, styles.bottomLeft]} />
              <View style={[styles.corner, styles.bottomRight]} />

              {/* QR Code graphic placeholder */}
              <View style={styles.qrGraphic}>
                <Ionicons name="qr-code" size={90} color="#1E293B" />
              </View>
            </TouchableOpacity>

            <Text style={styles.scannerSubtext}>
              นำกล้องไปสแกนที่ QR Code ของหัวหน้ากลุ่ม
            </Text>
          </View>

          {/* Divider "— หรือ —" */}
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>หรือ</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Bottom Card: Invite Code */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>ใส่รหัสคำเชิญเข้าร่วมกลุ่ม</Text>

            <TextInput
              style={styles.codeInput}
              placeholder="พิมพ์รหัส 6 หลัก (เช่น GR-829A)"
              placeholderTextColor="#94A3B8"
              value={inviteCode}
              onChangeText={setInviteCode}
              autoCapitalize="characters"
            />

            <TouchableOpacity 
              style={styles.joinBtn}
              onPress={handleJoinByCode}
              activeOpacity={0.85}
            >
              <Text style={styles.joinBtnText}>เข้าร่วมกลุ่มทันที</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    </ResponsiveWrapper>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
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
  backButton: {
    padding: 6,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1E293B',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#F1F5F9',
    ...SHADOWS.small,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 20,
    textAlign: 'center',
  },
  scannerContainer: {
    width: 200,
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    marginBottom: 16,
  },
  corner: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderColor: '#7C3AED',
  },
  topLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 6,
  },
  topRight: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 6,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 6,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 6,
  },
  qrGraphic: {
    width: 140,
    height: 140,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scannerSubtext: {
    fontSize: 13,
    color: '#94A3B8',
    textAlign: 'center',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E2E8F0',
  },
  dividerText: {
    fontSize: 14,
    color: '#94A3B8',
    paddingHorizontal: 16,
  },
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
    ...SHADOWS.small,
  },
  joinBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
