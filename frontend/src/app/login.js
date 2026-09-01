import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import api, { setToken } from '@/lib/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
  try {
    const response = await fetch('http://192.168.0.3:3000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'เข้าสู่ระบบไม่สำเร็จ');
    }

    // 💡 สำคัญมาก: ต้องแน่ใจว่าได้บันทึก token ลง AsyncStorage ตรงนี้
    if (data.token) {
      await AsyncStorage.setItem('token', data.token);
      
      // (Option) หากต้องการเก็บข้อมูล user
      if (data.user) {
        await AsyncStorage.setItem('user', JSON.stringify(data.user));
      }

      Alert.alert('สำเร็จ', 'เข้าสู่ระบบเรียบร้อย');
      router.replace('/dashboard'); // หรือหน้าหลักของคุณ
    } else {
      Alert.alert('Error', 'ไม่ได้รับ Token จากเซิร์ฟเวอร์');
    }
  } catch (err) {
    Alert.alert('ข้อผิดพลาด', err.message);
  }
};

  return (
    <View style={styles.container}>
      <Text style={styles.title}>เข้าสู่ระบบ</Text>
      <TextInput placeholder="อีเมล" value={email} onChangeText={setEmail} style={styles.input} autoCapitalize="none" keyboardType="email-address" />
      <TextInput placeholder="รหัสผ่าน" value={password} onChangeText={setPassword} style={styles.input} secureTextEntry />
      <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
        <Text style={styles.buttonText}>{loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => router.push('/register')} style={{ marginTop: 12 }}>
        <Text style={{ color: '#6c5ce7' }}>ยังไม่มีบัญชี? สมัครสมาชิก</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20, backgroundColor: '#fff' },
  title: { fontSize: 28, fontWeight: '700', marginBottom: 24, color: '#6c5ce7' },
  input: { width: '100%', borderWidth: 1, borderColor: '#eee', padding: 12, borderRadius: 8, marginBottom: 12 },
  button: { width: '100%', backgroundColor: '#6c5ce7', padding: 14, borderRadius: 8, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '700' },
});