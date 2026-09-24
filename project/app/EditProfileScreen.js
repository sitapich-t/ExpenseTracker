import React, { useState } from "react";
import {
    View,
    Text,
    StyleSheet,
    SafeAreaView,
    ScrollView,
    TouchableOpacity,
    TextInput,
    Alert,
    Image,
    KeyboardAvoidingView,
    Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import * as ImagePicker from "expo-image-picker";
import axios from 'axios';
import { useAuth } from "./context/AuthContext";
import { SHADOWS } from "../theme";
import ResponsiveWrapper from "../components/ResponsiveWrapper";

const API_URL = 'http://10.0.2.2:3000/api';

export default function EditProfileScreen() {
    const navigation = useNavigation();
    const { currentUser, updateUser } = useAuth();

    // Form states initialized with current profile
    const [name, setName] = useState(currentUser?.name || currentUser?.username || '');
    const [email, setEmail] = useState(currentUser?.email || "peet@email.com");
    const [phone, setPhone] = useState(currentUser?.phone || "098-765-4321");
    const [studentId, setStudentId] = useState(currentUser?.studentId || "pt1569");
    const [birthDate, setBirthDate] = useState(currentUser?.birthDate || "15/03/2003");
    const [avatar, setAvatar] = useState(
        currentUser?.avatar ||
        "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=400&q=80"
    );

    // Pick avatar image from library or presets
    const handlePickImage = async () => {
        try {
            const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (permissionResult.granted === false) {
                Alert.alert("ขอสิทธิ์เข้าถึง", "กรุณาอนุญาตให้เข้าถึงคลังภาพเพื่อเปลี่ยนรูปโปรไฟล์");
                return;
            }

            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                allowsEditing: true,
                aspect: [1, 1],
                quality: 0.8,
            });

            if (!result.canceled && result.assets && result.assets.length > 0) {
                setAvatar(result.assets[0].uri);
            }
        } catch (e) {
            Alert.alert("เลือกรูป", "ไม่สามารถเปิดคลังภาพได้ในขณะนี้");
        }
    };

    const handleSave = async () => {
        if (!name.trim()) {
            Alert.alert("ข้อมูลไม่ครบถ้วน", "กรุณาระบุชื่อ-นามสกุล");
            return;
        }

        try {
            // Update on server
            try {
              if (currentUser?.id) {
                const res = await axios.put(`${API_URL}/users/${currentUser.id}`, {
                  username: name.trim(),
                });
                if (!res.data?.success) {
                  Alert.alert('ข้อผิดพลาด', res.data?.message || 'ไม่สามารถบันทึกข้อมูลบนเซิร์ฟเวอร์ได้');
                  return;
                }
              }
            } catch (e) {
              console.log('Server update error:', e.message);
              Alert.alert('ข้อผิดพลาด', 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้');
              return;
            }

            await updateUser({
                name: name.trim(),
                username: name.trim(),
                email: email.trim(),
                phone: phone.trim(),
                studentId: studentId.trim(),
                birthDate: birthDate.trim(),
                avatar,
            });

            Alert.alert(
                "บันทึกสำเร็จ! 🎉",
                "บันทึกการเปลี่ยนแปลงข้อมูลส่วนตัวเรียบร้อยแล้ว",
                [
                    {
                        text: "ตกลง",
                        onPress: () => navigation.goBack(),
                    },
                ]
            );
        } catch (err) {
            Alert.alert("เกิดข้อผิดพลาด", "ไม่สามารถบันทึกข้อมูลได้ กรุณาลองใหม่อีกครั้ง");
        }
    };

    return (
        <ResponsiveWrapper>
            <SafeAreaView style={styles.safeArea}>
                <KeyboardAvoidingView
                    behavior={Platform.OS === "ios" ? "padding" : undefined}
                    style={{ flex: 1 }}
                >
                    {/* Header */}
                    <View style={styles.header}>
                        <TouchableOpacity
                            onPress={() => navigation.goBack()}
                            style={styles.backButton}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                            <Ionicons name="chevron-back" size={24} color="#1E293B" />
                        </TouchableOpacity>
                        <Text style={styles.headerTitle}>ข้อมูลส่วนตัว</Text>
                        <View style={{ width: 36 }} />
                    </View>

                    <ScrollView
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={styles.scrollContent}
                    >
                        {/* Avatar & Change Picture Button */}
                        <View style={styles.avatarSection}>
                            <TouchableOpacity
                                style={styles.avatarWrapper}
                                onPress={handlePickImage}
                                activeOpacity={0.85}
                            >
                                <Image source={{ uri: avatar }} style={styles.avatarImage} />
                                <View style={styles.cameraBadge}>
                                    <Ionicons name="camera" size={14} color="#FFFFFF" />
                                </View>
                            </TouchableOpacity>

                            <TouchableOpacity
                                onPress={handlePickImage}
                                activeOpacity={0.8}
                                style={{ marginTop: 8 }}
                            >
                                <Text style={styles.changeAvatarText}>เปลี่ยนรูปโปรไฟล์</Text>
                            </TouchableOpacity>
                        </View>

                        {/* Form Card (5 fields matching Figma) */}
                        <View style={styles.formCard}>
                            {/* Field 1: ชื่อ-นามสกุล */}
                            <View style={styles.fieldRow}>
                                <View style={styles.fieldTextCol}>
                                    <Text style={styles.fieldLabel}>ชื่อ-นามสกุล</Text>
                                    <TextInput
                                        style={styles.fieldInput}
                                        value={name}
                                        onChangeText={setName}
                                        placeholder="ระบุชื่อ-นามสกุล"
                                        placeholderTextColor="#94A3B8"
                                    />
                                </View>
                                <Ionicons name="create-outline" size={18} color="#7C3AED" />
                            </View>

                            <View style={styles.fieldDivider} />

                            {/* Field 2: อีเมล */}
                            <View style={styles.fieldRow}>
                                <View style={styles.fieldTextCol}>
                                    <Text style={styles.fieldLabel}>อีเมล</Text>
                                    <TextInput
                                        style={styles.fieldInput}
                                        value={email}
                                        onChangeText={setEmail}
                                        placeholder="ระบุอีเมล"
                                        placeholderTextColor="#94A3B8"
                                        keyboardType="email-address"
                                        autoCapitalize="none"
                                    />
                                </View>
                                <Ionicons name="create-outline" size={18} color="#7C3AED" />
                            </View>

                            <View style={styles.fieldDivider} />

                            {/* Field 3: เบอร์โทรศัพท์ */}
                            <View style={styles.fieldRow}>
                                <View style={styles.fieldTextCol}>
                                    <Text style={styles.fieldLabel}>เบอร์โทรศัพท์</Text>
                                    <TextInput
                                        style={styles.fieldInput}
                                        value={phone}
                                        onChangeText={setPhone}
                                        placeholder="ระบุเบอร์โทรศัพท์"
                                        placeholderTextColor="#94A3B8"
                                        keyboardType="phone-pad"
                                    />
                                </View>
                                <Ionicons name="create-outline" size={18} color="#7C3AED" />
                            </View>

                            <View style={styles.fieldDivider} />

                            {/* Field 4: รหัสนักศึกษา */}
                            <View style={styles.fieldRow}>
                                <View style={styles.fieldTextCol}>
                                    <Text style={styles.fieldLabel}>รหัสนักศึกษา</Text>
                                    <TextInput
                                        style={styles.fieldInput}
                                        value={studentId}
                                        onChangeText={setStudentId}
                                        placeholder="ระบุรหัสนักศึกษา"
                                        placeholderTextColor="#94A3B8"
                                    />
                                </View>
                                <Ionicons name="create-outline" size={18} color="#7C3AED" />
                            </View>

                            <View style={styles.fieldDivider} />

                            {/* Field 5: วันเกิด */}
                            <View style={styles.fieldRow}>
                                <View style={styles.fieldTextCol}>
                                    <Text style={styles.fieldLabel}>วันเกิด</Text>
                                    <TextInput
                                        style={styles.fieldInput}
                                        value={birthDate}
                                        onChangeText={setBirthDate}
                                        placeholder="วัน/เดือน/ปี เช่น 15/03/2003"
                                        placeholderTextColor="#94A3B8"
                                    />
                                </View>
                                <Ionicons name="create-outline" size={18} color="#7C3AED" />
                            </View>
                        </View>

                        {/* Bottom Purple Save Button */}
                        <TouchableOpacity
                            style={styles.saveBtn}
                            onPress={handleSave}
                            activeOpacity={0.85}
                        >
                            <Text style={styles.saveBtnText}>บันทึกการเปลี่ยนแปลง</Text>
                        </TouchableOpacity>
                    </ScrollView>
                </KeyboardAvoidingView>
            </SafeAreaView>
        </ResponsiveWrapper>
    );
}

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: "#FFFFFF",
    },
    header: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingHorizontal: 20,
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: "#F1F5F9",
    },
    backButton: {
        padding: 4,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: "700",
        color: "#1E293B",
    },
    scrollContent: {
        paddingHorizontal: 20,
        paddingTop: 24,
        paddingBottom: 40,
    },
    avatarSection: {
        alignItems: "center",
        marginBottom: 24,
    },
    avatarWrapper: {
        width: 90,
        height: 90,
        borderRadius: 45,
        position: "relative",
    },
    avatarImage: {
        width: 90,
        height: 90,
        borderRadius: 45,
    },
    cameraBadge: {
        position: "absolute",
        bottom: 0,
        right: 0,
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: "#6D28D9",
        justifyContent: "center",
        alignItems: "center",
        borderWidth: 2,
        borderColor: "#FFFFFF",
    },
    changeAvatarText: {
        fontSize: 13,
        fontWeight: "700",
        color: "#6D28D9",
    },
    formCard: {
        backgroundColor: "#FFFFFF",
        borderRadius: 20,
        borderWidth: 1,
        borderColor: "#E2E8F0",
        paddingHorizontal: 16,
        paddingVertical: 6,
        marginBottom: 28,
        ...SHADOWS.small,
    },
    fieldRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: 12,
    },
    fieldTextCol: {
        flex: 1,
        marginRight: 10,
    },
    fieldLabel: {
        fontSize: 11,
        color: "#94A3B8",
        fontWeight: "600",
        marginBottom: 3,
    },
    fieldInput: {
        fontSize: 15,
        fontWeight: "700",
        color: "#1E293B",
        padding: 0,
    },
    fieldDivider: {
        height: 1,
        backgroundColor: "#F1F5F9",
    },
    saveBtn: {
        backgroundColor: "#5B21B6",
        borderRadius: 24,
        paddingVertical: 16,
        alignItems: "center",
        justifyContent: "center",
        ...SHADOWS.medium,
    },
    saveBtnText: {
        color: "#FFFFFF",
        fontSize: 15,
        fontWeight: "700",
    },
});
