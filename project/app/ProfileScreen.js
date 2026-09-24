import React, { useState, useCallback } from "react";
import {
    View,
    Text,
    StyleSheet,
    SafeAreaView,
    ScrollView,
    TouchableOpacity,
    Alert,
    Image,
    Switch,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import axios from 'axios';
import { useAuth } from "./context/AuthContext";
import { SHADOWS } from "../theme";
import ResponsiveWrapper from "../components/ResponsiveWrapper";

export default function ProfileScreen() {
    const navigation = useNavigation();
    const { currentUser, logout } = useAuth();

    const [isDarkMode, setIsDarkMode] = useState(false);
    const [profile, setProfile] = useState(null);

    useFocusEffect(
        useCallback(() => {
            const fetchProfile = async () => {
                if (!currentUser?.id) return;
                try {
                    const res = await axios.get(`http://10.0.2.2:3000/api/users/${currentUser.id}`);
                    if (res.data?.success && res.data.data) {
                        setProfile(res.data.data);
                    }
                } catch (e) {
                    console.log('Error fetching profile:', e.message);
                }
            };
            fetchProfile();
        }, [currentUser])
    );

    // Profile attributes with fallbacks matching Figma
    const name = profile?.name || profile?.username || currentUser?.name || currentUser?.username || 'ผู้ใช้งาน';
    const email = profile?.email || currentUser?.email || "peet@email.com";
    const studentId = profile?.studentId || currentUser?.studentId || "pt1569";
    const avatar = profile?.avatar || currentUser?.avatar || "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=400&q=80";

    const handleLogout = () => {
        Alert.alert(
            "ออกจากระบบ",
            "คุณต้องการออกจากระบบ Expense Tracker ใช่หรือไม่?",
            [
                { text: "ยกเลิก", style: "cancel" },
                {
                    text: "ออกจากระบบ",
                    style: "destructive",
                    onPress: async () => {
                        await logout();
                        navigation.replace("Login");
                    },
                },
            ]
        );
    };

    return (
        <ResponsiveWrapper>
            <SafeAreaView style={styles.safeArea}>
                <ScrollView
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={styles.scrollContent}
                >
                    {/* Top Profile Card (Matching Figma exact design) */}
                    <View style={styles.profileCard}>
                        {/* Avatar Image */}
                        <View style={styles.avatarContainer}>
                            <Image
                                source={{ uri: avatar }}
                                style={styles.avatarImage}
                            />
                        </View>

                        {/* User Name */}
                        <Text style={styles.userName}>{name}</Text>

                        {/* Sub details: studentId • email */}
                        <Text style={styles.userSubDetails}>
                            {studentId} • {email}
                        </Text>

                        {/* Edit Profile Button Pill */}
                        <TouchableOpacity
                            style={styles.editProfilePill}
                            onPress={() => navigation.navigate("EditProfile")}
                            activeOpacity={0.8}
                        >
                            <Ionicons
                                name="create-outline"
                                size={15}
                                color="#6D28D9"
                                style={{ marginRight: 6 }}
                            />
                            <Text style={styles.editProfileText}>แก้ไขข้อมูลส่วนตัว</Text>
                        </TouchableOpacity>
                    </View>

                    {/* Section 1: Account Settings */}
                    <Text style={styles.sectionHeaderTitle}>Account Settings</Text>

                    <View style={styles.settingsGroupCard}>
                        {/* Personal Info */}
                        <TouchableOpacity
                            style={styles.settingsRow}
                            onPress={() => navigation.navigate("EditProfile")}
                            activeOpacity={0.7}
                        >
                            <View style={styles.settingIconBox}>
                                <Ionicons name="person" size={18} color="#7C3AED" />
                            </View>
                            <View style={styles.settingInfoCol}>
                                <Text style={styles.settingItemTitle}>Personal Info</Text>
                                <Text style={styles.settingItemSub}>Update your details</Text>
                            </View>
                            <Ionicons name="chevron-forward" size={18} color="#CBD5E1" />
                        </TouchableOpacity>

                        <View style={styles.rowDivider} />

                        {/* Student Info */}
                        <TouchableOpacity
                            style={styles.settingsRow}
                            onPress={() =>
                                Alert.alert(
                                    "ข้อมูลนักศึกษา 🎓",
                                    `รหัสนักศึกษา: ${studentId}\nสถานะ: กำลังศึกษา\nคณะ: วิศวกรรมศาสตร์และเทคโนโลยีสารสนเทศ`
                                )
                            }
                            activeOpacity={0.7}
                        >
                            <View style={styles.settingIconBox}>
                                <Ionicons name="school" size={18} color="#7C3AED" />
                            </View>
                            <View style={styles.settingInfoCol}>
                                <Text style={styles.settingItemTitle}>Student Info</Text>
                                <Text style={styles.settingItemSub}>Manage university details</Text>
                            </View>
                            <Ionicons name="chevron-forward" size={18} color="#CBD5E1" />
                        </TouchableOpacity>

                        <View style={styles.rowDivider} />

                        {/* Payment Methods */}
                        <TouchableOpacity
                            style={styles.settingsRow}
                            onPress={() =>
                                Alert.alert(
                                    "ช่องทางการชำระเงิน 💳",
                                    "• พร้อมเพย์: 098-765-4321\n• บัญชีกสิกรไทย: xxx-x-xx569-x"
                                )
                            }
                            activeOpacity={0.7}
                        >
                            <View style={styles.settingIconBox}>
                                <Ionicons name="card" size={18} color="#7C3AED" />
                            </View>
                            <View style={styles.settingInfoCol}>
                                <Text style={styles.settingItemTitle}>Payment Methods</Text>
                                <Text style={styles.settingItemSub}>Linked cards & accounts</Text>
                            </View>
                            <Ionicons name="chevron-forward" size={18} color="#CBD5E1" />
                        </TouchableOpacity>
                    </View>

                    {/* Section 2: Preferences */}
                    <Text style={styles.sectionHeaderTitle}>Preferences</Text>

                    <View style={styles.settingsGroupCard}>
                        {/* Notifications */}
                        <TouchableOpacity
                            style={styles.settingsRow}
                            onPress={() =>
                                Alert.alert(
                                    "การแจ้งเตือน 🔔",
                                    "• เตือนเมื่อเกินงบประมาณ: เปิดใช้งาน\n• เตือนทวงหนี้ในกลุ่ม: เปิดใช้งาน"
                                )
                            }
                            activeOpacity={0.7}
                        >
                            <View style={styles.prefIconBox}>
                                <Ionicons name="notifications-outline" size={20} color="#334155" />
                            </View>
                            <View style={styles.settingInfoCol}>
                                <Text style={styles.settingItemTitle}>Notifications</Text>
                            </View>
                            <Ionicons name="chevron-forward" size={18} color="#CBD5E1" />
                        </TouchableOpacity>

                        <View style={styles.rowDivider} />

                        {/* Dark Mode */}
                        <View style={styles.settingsRow}>
                            <View style={styles.prefIconBox}>
                                <Ionicons name="moon-outline" size={20} color="#334155" />
                            </View>
                            <View style={styles.settingInfoCol}>
                                <Text style={styles.settingItemTitle}>Dark Mode</Text>
                            </View>
                            <Switch
                                value={isDarkMode}
                                onValueChange={setIsDarkMode}
                                trackColor={{ false: "#E2E8F0", true: "#8B5CF6" }}
                                thumbColor={isDarkMode ? "#6D28D9" : "#FFFFFF"}
                            />
                        </View>

                        <View style={styles.rowDivider} />

                        {/* Logout Option */}
                        <TouchableOpacity
                            style={styles.settingsRow}
                            onPress={handleLogout}
                            activeOpacity={0.7}
                        >
                            <View style={styles.logoutIconBox}>
                                <Ionicons name="log-out-outline" size={20} color="#EF4444" />
                            </View>
                            <View style={styles.settingInfoCol}>
                                <Text style={[styles.settingItemTitle, { color: "#EF4444" }]}>
                                    ออกจากระบบ
                                </Text>
                            </View>
                            <Ionicons name="chevron-forward" size={18} color="#FCA5A5" />
                        </TouchableOpacity>
                    </View>
                </ScrollView>
            </SafeAreaView>
        </ResponsiveWrapper>
    );
}

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: "#F8FAFC",
    },
    scrollContent: {
        paddingHorizontal: 20,
        paddingTop: 20,
        paddingBottom: 100,
    },
    profileCard: {
        backgroundColor: "#FFFFFF",
        borderRadius: 24,
        paddingVertical: 24,
        paddingHorizontal: 20,
        alignItems: "center",
        borderWidth: 1,
        borderColor: "#F1F5F9",
        marginBottom: 24,
        ...SHADOWS.small,
    },
    avatarContainer: {
        width: 80,
        height: 80,
        borderRadius: 40,
        overflow: "hidden",
        marginBottom: 12,
        borderWidth: 3,
        borderColor: "#F3E8FF",
    },
    avatarImage: {
        width: "100%",
        height: "100%",
    },
    userName: {
        fontSize: 20,
        fontWeight: "800",
        color: "#1E293B",
        marginBottom: 4,
    },
    userSubDetails: {
        fontSize: 13,
        color: "#94A3B8",
        fontWeight: "500",
        marginBottom: 16,
    },
    editProfilePill: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#EDE9FE",
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
    },
    editProfileText: {
        fontSize: 13,
        fontWeight: "700",
        color: "#6D28D9",
    },
    sectionHeaderTitle: {
        fontSize: 15,
        fontWeight: "700",
        color: "#1E293B",
        marginBottom: 12,
        paddingHorizontal: 4,
    },
    settingsGroupCard: {
        backgroundColor: "#FFFFFF",
        borderRadius: 20,
        borderWidth: 1,
        borderColor: "#F1F5F9",
        paddingHorizontal: 16,
        paddingVertical: 4,
        marginBottom: 20,
        ...SHADOWS.small,
    },
    settingsRow: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 14,
    },
    settingIconBox: {
        width: 38,
        height: 38,
        borderRadius: 12,
        backgroundColor: "#F3E8FF",
        justifyContent: "center",
        alignItems: "center",
        marginRight: 14,
    },
    prefIconBox: {
        width: 38,
        height: 38,
        justifyContent: "center",
        alignItems: "center",
        marginRight: 14,
    },
    logoutIconBox: {
        width: 38,
        height: 38,
        borderRadius: 12,
        backgroundColor: "#FEF2F2",
        justifyContent: "center",
        alignItems: "center",
        marginRight: 14,
    },
    settingInfoCol: {
        flex: 1,
    },
    settingItemTitle: {
        fontSize: 15,
        fontWeight: "600",
        color: "#1E293B",
        marginBottom: 2,
    },
    settingItemSub: {
        fontSize: 12,
        color: "#94A3B8",
    },
    rowDivider: {
        height: 1,
        backgroundColor: "#F8FAFC",
        marginLeft: 52,
    },
});