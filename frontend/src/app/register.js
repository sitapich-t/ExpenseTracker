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
import api, { setToken } from '@/lib/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function RegisterScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!name || !email || !password || !confirmPassword) {
      Alert.alert('ข้อผิดพลาด', 'กรุณากรอกข้อมูลให้ครบถ้วน');
      return;
    }
    
    if (password.length < 6) {
      Alert.alert('ข้อผิดพลาด', 'รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('ข้อผิดพลาด', 'รหัสผ่านไม่ตรงกัน');
      return;
    }

    try {
      setLoading(true);
      const response = await api.post('/api/auth/register', {
        name,
        email,
        password,
      });

      if (response.data && response.data.token) {
        await setToken(response.data.token);
        await AsyncStorage.setItem('userData', JSON.stringify(response.data.user));
        Alert.alert('สำเร็จ', 'สร้างบัญชีสำเร็จ', [
          { text: 'ตกลง', onPress: () => router.replace('/(tabs)') }
        ]);
      }
    } catch (error) {
      console.error('Register error:', error);
      Alert.alert(
        'ข้อผิดพลาด',
        error.response?.data?.message || 'ไม่สามารถสมัครสมาชิกได้ กรุณาลองใหม่อีกครั้ง'
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
            <Ionicons name="wallet-outline" size={60} color="#5f3dc4" />
          </View>
          <Text style={styles.appName}>Student Wallet</Text>
          <Text style={styles.subtitle}>สร้างบัญชีใหม่</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.inputContainer}>
            <Ionicons name="person-outline" size={24} color="#6c5ce7" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="ชื่อ-นามสกุล"
              value={name}
              onChangeText={setName}
              placeholderTextColor="#a0a0a0"
            />
          </View>

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

          <View style={styles.inputContainer}>
            <Ionicons name="lock-closed-outline" size={24} color="#6c5ce7" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="รหัสผ่าน"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              placeholderTextColor="#a0a0a0"
            />
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeIcon}>
              <Ionicons name={showPassword ? "eye-outline" : "eye-off-outline"} size={24} color="#6c5ce7" />
            </TouchableOpacity>
          </View>

          <View style={styles.inputContainer}>
            <Ionicons name="shield-checkmark-outline" size={24} color="#6c5ce7" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="ยืนยันรหัสผ่าน"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={!showConfirmPassword}
              placeholderTextColor="#a0a0a0"
            />
            <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)} style={styles.eyeIcon}>
              <Ionicons name={showConfirmPassword ? "eye-outline" : "eye-off-outline"} size={24} color="#6c5ce7" />
            </TouchableOpacity>
          </View>

          <TouchableOpacity 
            style={styles.registerButton} 
            onPress={handleRegister}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.registerButtonText}>สมัครสมาชิก</Text>
            )}
          </TouchableOpacity>

          <View style={styles.loginContainer}>
            <Text style={styles.loginText}>มีบัญชีอยู่แล้วใช่ไหม? </Text>
            <TouchableOpacity onPress={() => router.push('/login')}>
              <Text style={styles.loginLink}>เข้าสู่ระบบ</Text>
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
  registerButton: {
    backgroundColor: '#5f3dc4',
    borderRadius: 16,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
    elevation: 4,
    shadowColor: '#5f3dc4',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  registerButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  loginContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 24,
  },
  loginText: {
    color: '#666',
    fontSize: 15,
  },
  loginLink: {
    color: '#5f3dc4',
    fontSize: 15,
    fontWeight: 'bold',
  },
});
