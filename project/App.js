import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { ActivityIndicator, View, LogBox } from "react-native";

LogBox.ignoreAllLogs(true);

import { AuthProvider, useAuth } from "./app/context/AuthContext";
import LoginScreen from "./app/LoginScreen";
import RegisterScreen from "./app/RegisterScreen";
import OTPScreen from "./app/OTPScreen";
import BottomTabs from "./app/BottomTabs";
import AddExpenseScreen from "./app/AddExpenseScreen";
import BudgetScreen from "./app/BudgetScreen";
import CreateGroupScreen from "./app/CreateGroupScreen";
import GroupDetailScreen from "./app/GroupDetailScreen";
import AddGroupExpenseScreen from "./app/AddGroupExpenseScreen";
import GroupSettleScreen from "./app/GroupSettleScreen";
import GroupQRCodeScreen from "./app/GroupQRCodeScreen";
import ScanQRCodeScreen from "./app/ScanQRCodeScreen";
import JoinGroupScreen from "./app/JoinGroupScreen";
import UploadSlipScreen from "./app/UploadSlipScreen";
import ScanResultScreen from "./app/ScanResultScreen";
import EditProfileScreen from "./app/EditProfileScreen";
import ResponsiveWrapper from "./components/ResponsiveWrapper";
import { COLORS } from "./theme";

const Stack = createNativeStackNavigator();

function RootNavigator() {
    const { currentUser, loading } = useAuth();

    if (loading) {
        return (
            <ResponsiveWrapper>
                <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: COLORS.background }}>
                    <ActivityIndicator size="large" color={COLORS.primary} />
                </View>
            </ResponsiveWrapper>
        );
    }

    return (
        <NavigationContainer>
            <Stack.Navigator
                initialRouteName={currentUser ? "Home" : "Login"}
                screenOptions={{ headerShown: false }}
            >
                <Stack.Screen name="Login" component={LoginScreen} />
                <Stack.Screen name="Register" component={RegisterScreen} />
                <Stack.Screen name="OTP" component={OTPScreen} />
                <Stack.Screen name="Home" component={BottomTabs} />
                <Stack.Screen name="AddExpense" component={AddExpenseScreen} />
                <Stack.Screen name="Budget" component={BudgetScreen} />
                <Stack.Screen name="UploadSlip" component={UploadSlipScreen} />
                <Stack.Screen name="ScanResult" component={ScanResultScreen} />
                <Stack.Screen name="CreateGroup" component={CreateGroupScreen} />
                <Stack.Screen name="GroupDetail" component={GroupDetailScreen} />
                <Stack.Screen name="AddGroupExpense" component={AddGroupExpenseScreen} />
                <Stack.Screen name="GroupSettle" component={GroupSettleScreen} />
                <Stack.Screen name="GroupQRCode" component={GroupQRCodeScreen} />
                <Stack.Screen name="ScanQRCode" component={ScanQRCodeScreen} />
                <Stack.Screen name="JoinGroup" component={JoinGroupScreen} />
                <Stack.Screen name="EditProfile" component={EditProfileScreen} />
            </Stack.Navigator>
        </NavigationContainer>
    );
}

export default function App() {
    return (
        <AuthProvider>
            <RootNavigator />
        </AuthProvider>
    );
}
