import { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function IndexScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) {
        // 💡 ถ้าไม่มี Token ให้ส่งไปหน้า Login ทันที
        router.replace('/login');
      } else {
        // 💡 ถ้ามี Token ให้เข้าหน้าหลัก (เช่น /home หรือ /(tabs))
        router.replace('/(main)/dashboard'); 
      }
    } catch (e) {
      router.replace('/login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color="#6c5ce7" />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});