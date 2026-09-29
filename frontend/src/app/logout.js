import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { clearToken } from '@/lib/api';

export default function Logout() {
  const router = useRouter();
  useEffect(() => {
    (async () => {
      await clearToken();
      router.replace('/login');
    })();
  }, []);
  return null;
}
