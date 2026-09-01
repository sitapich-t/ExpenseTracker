import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import api, { setToken } from '@/lib/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function RegisterScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleRegister() {
    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();
    const cleanConfirm = confirmPassword.trim();

    if (!cleanName || !cleanEmail || !cleanPassword || !cleanConfirm) {
      return Alert.alert('Validation', 'กรุณากรอกข้อมูลให้ครบ');
    }
    if (cleanPassword !== cleanConfirm) return Alert.alert('Validation', 'รหัสผ่านไม่ตรงกัน');
    if (cleanPassword.length < 6) return Alert.alert('Validation', 'รหัสผ่านต้องมีอย่างน้อย 6 ตัว');

    setLoading(true);
    try {
      const res = await api.post('/api/auth/register', { name: cleanName, email: cleanEmail, password: cleanPassword });
      await setToken(res.token);
      await AsyncStorage.setItem('user', JSON.stringify(res.user));
      router.replace('/');
    } catch (err) {
      Alert.alert('Register failed', err.body?.error || err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>สมัครสมาชิก</Text>
      <TextInput placeholder="ชื่อ" value={name} onChangeText={setName} style={styles.input} />
      <TextInput placeholder="อีเมล" value={email} onChangeText={setEmail} style={styles.input} autoCapitalize="none" keyboardType="email-address" />
      <TextInput placeholder="รหัสผ่าน" value={password} onChangeText={setPassword} style={styles.input} secureTextEntry />
      <TextInput placeholder="ยืนยันรหัสผ่าน" value={confirmPassword} onChangeText={setConfirmPassword} style={styles.input} secureTextEntry />
      <TouchableOpacity style={styles.button} onPress={handleRegister} disabled={loading}>
        <Text style={styles.buttonText}>{loading ? 'กำลังสมัคร...' : 'สมัครสมาชิก'}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => router.push('/login')} style={{ marginTop: 12 }}>
        <Text style={{ color: '#6c5ce7' }}>มีบัญชีแล้ว? เข้าสู่ระบบ</Text>
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
