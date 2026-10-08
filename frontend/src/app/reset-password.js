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
import { getFlow, clearFlow } from '@/lib/authFlow';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const flow = getFlow();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleReset = async () => {
    if (!flow?.reset_verified_token) {
      Alert.alert('เซสชันหมดอายุ', 'กรุณาเริ่มขั้นตอนลืมรหัสผ่านใหม่', [
        { text: 'ตกลง', onPress: () => router.replace('/forgot-password') },
      ]);
      return;
    }
    if (newPassword.length < 8) {
      Alert.alert('ข้อผิดพลาด', 'รหัสผ่านต้องมีความยาวอย่างน้อย 8 ตัวอักษร');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('ข้อผิดพลาด', 'รหัสผ่านไม่ตรงกัน');
      return;
    }

    try {
      setLoading(true);
      await api.post('/api/v1/auth/reset-password/confirm', {
        reset_verified_token: flow.reset_verified_token,
        newPassword,
      });

      clearFlow();
      Alert.alert('เปลี่ยนรหัสผ่านสำเร็จ', 'กรุณาเข้าสู่ระบบด้วยรหัสผ่านใหม่', [
        { text: 'ตกลง', onPress: () => router.replace('/login') },
      ]);
    } catch (err) {
      console.error('Reset password error:', err);
      const body = err.body || {};
      Alert.alert(
        'เปลี่ยนรหัสผ่านไม่สำเร็จ',
        body.error || err.message || 'กรุณาลองใหม่อีกครั้ง'
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
            <Ionicons name="lock-closed-outline" size={60} color="#5f3dc4" />
          </View>
          <Text style={styles.appName}>ตั้งรหัสผ่านใหม่</Text>
          <Text style={styles.subtitle}>รหัสผ่านใหม่จะมีผลกับทุกอุปกรณ์</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.inputContainer}>
            <Ionicons name="lock-closed-outline" size={24} color="#6c5ce7" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="รหัสผ่านใหม่ (อย่างน้อย 8 ตัวอักษร)"
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry={!showPassword}
              placeholderTextColor="#a0a0a0"
            />
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeIcon}>
              <Ionicons name={showPassword ? 'eye-outline' : 'eye-off-outline'} size={24} color="#6c5ce7" />
            </TouchableOpacity>
          </View>

          <View style={styles.inputContainer}>
            <Ionicons name="shield-checkmark-outline" size={24} color="#6c5ce7" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="ยืนยันรหัสผ่านใหม่"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={!showConfirmPassword}
              placeholderTextColor="#a0a0a0"
            />
            <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)} style={styles.eyeIcon}>
              <Ionicons name={showConfirmPassword ? 'eye-outline' : 'eye-off-outline'} size={24} color="#6c5ce7" />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.submitButton}
            onPress={handleReset}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.submitButtonText}>เปลี่ยนรหัสผ่าน</Text>
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
  eyeIcon: {
    padding: 8,
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
