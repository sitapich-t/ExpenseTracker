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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('ข้อผิดพลาด', 'กรุณากรอกอีเมลและรหัสผ่าน');
      return;
    }

    try {
      setLoading(true);
      const response = await fetch('http://10.0.2.2:3000/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });
      
      const data = await response.json();

      if (response.ok) {
        await AsyncStorage.setItem('userToken', data.token);
        if (data.user) {
           await AsyncStorage.setItem('userData', JSON.stringify(data.user));
        }
        router.replace('/(tabs)');
      } else {
        Alert.alert('เข้าสู่ระบบล้มเหลว', data.message || 'อีเมลหรือรหัสผ่านไม่ถูกต้อง');
      }
    } catch (error) {
      console.error('Login error:', error);
      Alert.alert('ข้อผิดพลาด', 'ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.topSection}>
        <View style={styles.iconContainer}>
          <Ionicons name="wallet-outline" size={80} color="#5f3dc4" />
        </View>
        <Text style={styles.appName}>Student Wallet</Text>
        <Text style={styles.subtitle}>จัดการการเงินของคุณได้อย่างง่ายดาย</Text>
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

        <TouchableOpacity 
          style={styles.loginButton} 
          onPress={handleLogin}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.loginButtonText}>เข้าสู่ระบบ</Text>
          )}
        </TouchableOpacity>

        <View style={styles.registerContainer}>
          <Text style={styles.registerText}>ยังไม่มีบัญชีใช่ไหม? </Text>
          <TouchableOpacity onPress={() => router.push('/register')}>
            <Text style={styles.registerLink}>สมัครสมาชิก</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f0ff',
    justifyContent: 'center',
    padding: 20,
  },
  topSection: {
    alignItems: 'center',
    marginBottom: 40,
  },
  iconContainer: {
    backgroundColor: '#ffffff',
    padding: 20,
    borderRadius: 60,
    elevation: 5,
    shadowColor: '#5f3dc4',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    marginBottom: 20,
  },
  appName: {
    fontSize: 32,
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
  loginButton: {
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
  loginButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  registerContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 24,
  },
  registerText: {
    color: '#666',
    fontSize: 15,
  },
  registerLink: {
    color: '#5f3dc4',
    fontSize: 15,
    fontWeight: 'bold',
  },
});