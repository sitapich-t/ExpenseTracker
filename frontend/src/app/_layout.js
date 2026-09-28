import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { GroupProvider } from './context/GroupContext';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <GroupProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="login" />
          <Stack.Screen name="register" />
          <Stack.Screen name="logout" />
          <Stack.Screen name="verify-otp" />
          <Stack.Screen name="(main)" />
          <Stack.Screen name="add-transaction" options={{ presentation: 'modal' }} />
          <Stack.Screen name="add-expense-screen" />
          <Stack.Screen name="scan-receipt" />
          <Stack.Screen name="confirm-receipt" />
          <Stack.Screen name="budget" />
          <Stack.Screen name="edit-profile" />
          {/* กลุ่ม */}
          <Stack.Screen name="create-group" />
          <Stack.Screen name="detail-group" />
          <Stack.Screen name="add-group-expense" />
          <Stack.Screen name="settle-group" />
          <Stack.Screen name="join-group" />
          <Stack.Screen name="scan-qr-group" />
          <Stack.Screen name="group-qrcode" />
        </Stack>
      </GroupProvider>
    </GestureHandlerRootView>
  );
}