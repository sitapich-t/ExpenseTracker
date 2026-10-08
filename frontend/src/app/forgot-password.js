import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '@/lib/api';
import { setFlow, clearFlow } from '@/lib/authFlow';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRequestOtp = async () => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      Alert.alert('ข้อผิดพลาด', 'กรุณากรอกอีเมลของคุณ');
      return;
    }

    try {
      setLoading(true);
      const res = await api.post('/api/v1/auth/reset-password/request-otp', {
        email: cleanEmail,
      });

      clearFlow();
      setFlow({
        password_reset_token: res.password_reset_token,
        expires_in: res.expires_in,
        email: cleanEmail,
      });

      Alert.alert('ส่งรหัส OTP แล้ว', 'กรุณาเช็คอีเมลเพื่อนำรหัส OTP 6 หลักมายืนยันตัวตน', [
        { text: 'ตกลง', onPress: () => router.push({ pathname: '/verify-otp', params: { mode: 'reset' } }) },
      ]);
    } catch (err) {
      console.error('Forgot password error:', err);
      const body = err.body || {};
      const wait = body.retry_after;
      Alert.alert(
        'ไม่สามารถขอรหัส OTP ได้',
        wait ? `${body.error} (${wait} วินาที)` : body.error || err.message || 'กรุณาลองใหม่อีกครั้ง'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>
        <View style={styles.topSection}>
          <View style={styles.iconContainer}>
            <Ionicons name="key-outline" size={60} color="#5f3dc4" />
          </View>
          <Text style={styles.appName}>ลืมรหัสผ่าน</Text>
          <Text style={styles.subtitle}>กรอกอีเมลของคุณเพื่อรับรหัส OTP</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.inputContainer}>
            <Ionicons name="mail-outline" size={24} color="#6c5ce7" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="อีเมล"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              placeholderTextColor="#a0a0a0"
            />
          </View>

          <TouchableOpacity
            style={styles.submitButton}
            onPress={handleRequestOtp}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.submitButtonText}>ส่งรหัส OTP</Text>
            )}
          </TouchableOpacity>

          <View style={styles.backContainer}>
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
  container: {
    flex: 1,
    backgroundColor: '#f5f0ff',
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
    paddingVertical: 40,
  },
  topSection: {
    alignItems: 'center',
    marginBottom: 30,
  },
  iconContainer: {
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 50,
    elevation: 5,
    shadowColor: '#5f3dc4',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    marginBottom: 16,
  },
  appName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#5f3dc4',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#6c5ce7',
    opacity: 0.8,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 24,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    borderRadius: 16,
    marginBottom: 16,
    paddingHorizontal: 16,
    height: 60,
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#333',
  },
  submitButton: {
    backgroundColor: '#5f3dc4',
    borderRadius: 16,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
    elevation: 4,
    shadowColor: '#5f3dc4',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  submitButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  backContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 24,
  },
  backLink: {
    color: '#5f3dc4',
    fontSize: 15,
    fontWeight: 'bold',
  },
});
