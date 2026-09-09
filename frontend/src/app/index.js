import { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { getToken } from '@/lib/api';

export default function IndexScreen() {
  const router = useRouter();

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const token = await getToken();
        // ถ้ามี Token ให้เข้าหน้าหลัก ไม่เช่นนั้นไปหน้า Login
        router.replace(token ? '/(main)/dashboard' : '/login');
      } catch {
        router.replace('/login');
      }
    };
    checkAuth();
  }, [router]);

  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color="#6c5ce7" />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});