import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert,
  KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import api, { setToken } from '@/lib/api';

export default function VerifyOtpScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const passedEmail = String(params.email || '').trim();

  const [email, setEmail] = useState(passedEmail);
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);

  const handleVerify = async () => {
    const cleanEmail = email.trim().toLowerCase();
    const cleanOtp = otp.trim();
    if (!cleanEmail) {
      Alert.alert('ข้อผิดพลาด', 'กรุณากรอกอีเมลที่ใช้ลงทะเบียน');
      return;
    }
    if (cleanOtp.length !== 6) {
      Alert.alert('ข้อผิดพลาด', 'กรุณากรอกรหัส OTP 6 หลักให้ครบ');
      return;
    }

    try {
      setLoading(true);
      const res = await api.post('/api/v1/auth/verify-otp', {
        email: cleanEmail,
        otp: cleanOtp,
      });
      await setToken(res.token);
      if (res.user) {
        await AsyncStorage.setItem('user', JSON.stringify(res.user));
      }
      Alert.alert('ยืนยันตัวตนสำเร็จ', 'เข้าสู่ระบบเรียบร้อยแล้ว');
      router.replace('/(main)/dashboard');
    } catch (err) {
      console.error('Verify OTP error:', err);
      Alert.alert('ยืนยันไม่สำเร็จ', err.body?.error || err.message || 'กรุณาลองใหม่อีกครั้ง');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>
        <View style={styles.topSection}>
          <View style={styles.iconContainer}>
            <Ionicons name="shield-checkmark-outline" size={64} color="#5f3dc4" />
          </View>
          <Text style={styles.appName}>ยืนยันตัวตน</Text>
          <Text style={styles.subtitle}>กรอกรหัส OTP 6 หลักจากอีเมล</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.labelTitle}>อีเมล</Text>
          <TextInput
            style={styles.emailInput}
            placeholder="อีเมลที่ใช้ลงทะเบียน"
            placeholderTextColor="#a0a0a0"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            editable={!passedEmail}
          />
          <Text style={styles.labelTitle}>รหัส OTP</Text>
          <TextInput
            style={styles.otpInput}
            placeholder="••••••"
            placeholderTextColor="#a0a0a0"
            keyboardType="number-pad"
            maxLength={6}
            value={otp}
            onChangeText={(text) => setOtp(text.replace(/[^0-9]/g, ''))}
            autoFocus
            caretHidden={false}
          />
          <Text style={styles.hintText}>รหัส OTP มีอายุ 10 นาที</Text>

          <TouchableOpacity
            style={styles.verifyButton}
            onPress={handleVerify}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.verifyButtonText}>ยืนยันและเข้าสู่ระบบ</Text>
            )}
          </TouchableOpacity>

          <View style={styles.backRow}>
            <TouchableOpacity onPress={() => router.replace('/login')}>
              <Text style={styles.backLink}>กลับไปหน้าเข้าสู่ระบบ</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fcfbfe' },
  scrollContainer: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  topSection: { alignItems: 'center', marginBottom: 32 },
  iconContainer: {
    width: 110, height: 110, borderRadius: 55,
    backgroundColor: '#f0ebfe', justifyContent: 'center', alignItems: 'center',
    marginBottom: 20,
  },
  appName: { fontSize: 24, fontWeight: 'bold', color: '#1f2937', marginBottom: 6 },
  subtitle: { fontSize: 14, color: '#6b7280', marginBottom: 6 },
  card: {
    backgroundColor: '#fff', borderRadius: 20, padding: 24,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06, shadowRadius: 12, elevation: 3,
  },
  labelTitle: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 8, marginTop: 4 },
  emailInput: {
    borderWidth: 1.5, borderColor: '#e2d9f3', borderRadius: 12,
    backgroundColor: '#f3f0ff', color: '#1f2937', paddingVertical: 12,
    paddingHorizontal: 14, fontSize: 16, marginBottom: 12,
  },
  otpInput: {
    borderWidth: 1.5, borderColor: '#e2d9f3', borderRadius: 12,
    backgroundColor: '#f3f0ff', fontSize: 28, fontWeight: '700',
    color: '#1f2937', textAlign: 'center', letterSpacing: 14,
    paddingVertical: 14, marginBottom: 8,
  },
  hintText: { textAlign: 'center', fontSize: 12, color: '#9ca3af', marginBottom: 20 },
  verifyButton: {
    backgroundColor: '#5f3dc4', borderRadius: 25, paddingVertical: 16,
    alignItems: 'center', justifyContent: 'center',
    elevation: 4, shadowColor: '#5f3dc4', shadowOpacity: 0.3, shadowRadius: 8,
  },
  verifyButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  backRow: { alignItems: 'center', marginTop: 16 },
  backLink: { color: '#5f3dc4', fontSize: 14, fontWeight: '600' },
});