import { Stack } from 'expo-router';

export default function RootLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
      <Stack.Screen name="logout" />
      <Stack.Screen name="verify-otp" />
      <Stack.Screen name="(main)" />
      <Stack.Screen name="add-transaction" />
      <Stack.Screen name="add-expense-screen" />
      <Stack.Screen name="scan-receipt" />
      <Stack.Screen name="confirm-receipt" />
      <Stack.Screen name="budget" />
      <Stack.Screen name="group-detail" />
      <Stack.Screen name="add-group-expense" />
      <Stack.Screen name="group-settle" />
      <Stack.Screen name="group-qrcode" />
      <Stack.Screen name="scan-qrcode" />
      <Stack.Screen name="join-group" />
      <Stack.Screen name="edit-profile" />
    </Stack>
  );
}