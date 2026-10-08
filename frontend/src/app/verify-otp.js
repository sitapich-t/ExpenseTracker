import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert,
  KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import api, { setToken } from '@/lib/api';
import { getFlow, setFlow, clearFlow } from '@/lib/authFlow';

export default function VerifyOtpScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const mode = params.mode === 'reset' ? 'reset' : 'register';

  const flow = getFlow();
  const email = flow?.email || '';

  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  if (!flow) {
    return (
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>
          <View style={styles.topSection}>
            <View style={styles.iconContainer}>
              <Ionicons name="alert-circle-outline" size={64} color="#ef4444" />
            </View>
            <Text style={styles.appName}>เซสชันหมดอายุ</Text>
            <Text style={styles.subtitle}>กรุณาเริ่มขั้นตอนยืนยันตัวตนใหม่</Text>
          </View>
          <View style={styles.card}>
            <TouchableOpacity
              style={styles.verifyButton}
              onPress={() => router.replace(mode === 'reset' ? '/forgot-password' : '/register')}
            >
              <Text style={styles.verifyButtonText}>เริ่มใหม่</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  const isRegister = mode === 'register';
  const tokenKey = isRegister ? 'registration_token' : 'password_reset_token';

  const handleVerify = async () => {
    const cleanOtp = otp.trim();
    if (cleanOtp.length !== 6) {
      Alert.alert('ข้อผิดพลาด', 'กรุณากรอกรหัส OTP 6 หลักให้ครบ');
      return;
    }

    try {
      setLoading(true);
      const path = isRegister
        ? '/api/v1/auth/register/verify-otp'
        : '/api/v1/auth/reset-password/verify-otp';
      const res = await api.post(path, {
        [tokenKey]: flow[tokenKey],
        otp: cleanOtp,
      });

      if (isRegister) {
        await setToken(res.token);
        if (res.user) {
          await AsyncStorage.setItem('user', JSON.stringify(res.user));
        }
        clearFlow();
        Alert.alert('สมัครสมาชิกสำเร็จ', 'เข้าสู่ระบบเรียบร้อยแล้ว');
        router.replace('/(main)/dashboard');
      } else {
        setFlow({
          reset_verified_token: res.reset_verified_token,
          expires_in: res.expires_in,
          email,
        });
        router.replace('/reset-password');
      }
    } catch (err) {
      console.error('Verify OTP error:', err);
      const attempts = err.body?.attempts_remaining;
      const message = err.body?.error || err.message || 'กรุณาลองใหม่อีกครั้ง';
      Alert.alert(
        'ยืนยันไม่สำเร็จ',
        typeof attempts === 'number' ? `${message} (เหลืออีก ${attempts} ครั้ง)` : message
      );
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!isRegister) return;
    try {
      setResending(true);
      const res = await api.post('/api/v1/auth/register/resend-otp', {
        registration_token: flow.registration_token,
      });
      setFlow({
        registration_token: res.registration_token,
        expires_in: res.expires_in,
        email,
      });
      Alert.alert('ส่งรหัส OTP ใหม่แล้ว', 'กรุณาเช็คอีเมลของคุณ');
    } catch (err) {
      const body = err.body || {};
      const wait = body.retry_after;
      Alert.alert(
        'ยังส่งใหม่ไม่ได้',
        wait ? `${body.error || 'ต้องรอ'} (${wait} วินาที)` : body.error || err.message || 'กรุณาลองใหม่อีกครั้ง'
      );
    } finally {
      setResending(false);
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
          <Text style={styles.appName}>{isRegister ? 'ยืนยันตัวตน' : 'ยืนยันรหัส OTP'}</Text>
          <Text style={styles.subtitle}>กรอกรหัส OTP 6 หลักจากอีเมล</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.labelTitle}>อีเมล</Text>
          <View style={styles.emailBox}>
            <Ionicons name="mail-outline" size={20} color="#6c5ce7" style={{ marginRight: 8 }} />
            <Text style={styles.emailText}>{email || '-'}</Text>
          </View>

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
              <Text style={styles.verifyButtonText}>
                {isRegister ? 'ยืนยันและเข้าสู่ระบบ' : 'ยืนยันตัวตน'}
              </Text>
            )}
          </TouchableOpacity>

          {isRegister && (
            <TouchableOpacity
              style={styles.resendButton}
              onPress={handleResend}
              disabled={resending}
            >
              {resending ? (
                <ActivityIndicator color="#5f3dc4" />
              ) : (
                <Text style={styles.resendText}>ไม่ได้รับรหัส? ส่งรหัสใหม่</Text>
              )}
            </TouchableOpacity>
          )}

          <View style={styles.backRow}>
            <TouchableOpacity onPress={() => router.replace(isRegister ? '/register' : '/forgot-password')}>
              <Text style={styles.backLink}>ย้อนกลับ</Text>
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
  emailBox: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1.5, borderColor: '#e2d9f3', borderRadius: 12,
    backgroundColor: '#f3f0ff', paddingVertical: 12, paddingHorizontal: 14, marginBottom: 12,
  },
  emailText: { fontSize: 16, color: '#1f2937' },
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
  resendButton: { alignItems: 'center', marginTop: 16, paddingVertical: 8 },
  resendText: { color: '#5f3dc4', fontSize: 14, fontWeight: '600' },
  backRow: { alignItems: 'center', marginTop: 8 },
  backLink: { color: '#9ca3af', fontSize: 14, fontWeight: '600' },
});
