import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, Share, Alert } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import QRCode from "react-native-qrcode-svg";
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from "../theme";
import ResponsiveWrapper from "../components/ResponsiveWrapper";

export default function GroupQRCodeScreen() {
    const navigation = useNavigation();
    const route = useRoute();
    const { groupId, groupName } = route.params || { groupId: "GR-829A", groupName: "กลุ่ม" };

    const qrValue = JSON.stringify({ action: "join_group", groupId, groupName });

    const handleShare = async () => {
        try {
            await Share.share({
                message: `เข้าร่วมกลุ่ม "${groupName}" ใน Expense Tracker ด้วยรหัส: ${groupId}`,
            });
        } catch (error) {
            console.log("Share error:", error);
        }
    };

    return (
        <ResponsiveWrapper>
            <View style={s.container}>
                {/* Header */}
                <View style={s.header}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
                        <Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} />
                    </TouchableOpacity>
                    <Text style={s.headerTitle}>QR Code เข้ากลุ่ม</Text>
                    <View style={{ width: 40 }} />
                </View>

                <View style={s.content}>
                    <View style={s.card}>
                        <View style={s.iconHeader}>
                            <Ionicons name="people" size={28} color={COLORS.primary} />
                        </View>
                        <Text style={s.title}>{groupName}</Text>
                        <Text style={s.subtitle}>ให้เพื่อนสแกน QR Code นี้เพื่อเข้าร่วมกลุ่ม</Text>

                        <View style={s.qrWrapper}>
                            <QRCode
                                value={qrValue}
                                size={220}
                                color={COLORS.textPrimary}
                                backgroundColor="#ffffff"
                            />
                        </View>

                        <View style={s.codeBox}>
                            <Text style={s.codeLabel}>หรือเข้าร่วมด้วยรหัส</Text>
                            <Text style={s.codeValue}>{groupId}</Text>
                        </View>
                    </View>

                    <TouchableOpacity style={s.shareBtn} onPress={handleShare}>
                        <Ionicons name="share-social-outline" size={20} color="#fff" />
                        <Text style={s.shareText}>แชร์คำเชิญให้เพื่อน</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </ResponsiveWrapper>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.background },
    header: {
        flexDirection: "row", justifyContent: "space-between", alignItems: "center",
        paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
        backgroundColor: COLORS.white,
        borderBottomWidth: 1, borderBottomColor: COLORS.border,
    },
    backBtn: {
        width: 40, height: 40, borderRadius: 20,
        backgroundColor: COLORS.background,
        justifyContent: "center", alignItems: "center",
    },
    headerTitle: {
        fontSize: 18, fontWeight: "700", color: COLORS.textPrimary,
    },
    content: {
        flex: 1, alignItems: "center", justifyContent: "center",
        padding: SPACING.lg, paddingBottom: 60,
    },
    card: {
        backgroundColor: COLORS.white,
        borderRadius: RADIUS.xxl,
        padding: SPACING.xl,
        alignItems: "center",
        width: "100%",
        maxWidth: 360,
        ...SHADOWS.large,
        marginBottom: SPACING.xl,
    },
    iconHeader: {
        width: 56, height: 56, borderRadius: 28,
        backgroundColor: COLORS.primaryBg,
        justifyContent: "center", alignItems: "center",
        marginBottom: SPACING.md,
    },
    title: {
        fontSize: 22, fontWeight: "700", color: COLORS.textPrimary,
        marginBottom: 6, textAlign: "center",
    },
    subtitle: {
        fontSize: 14, color: COLORS.textSecondary,
        marginBottom: SPACING.xl, textAlign: "center",
    },
    qrWrapper: {
        padding: SPACING.lg,
        backgroundColor: "#fff",
        borderRadius: RADIUS.lg,
        borderWidth: 1, borderColor: COLORS.border,
        marginBottom: SPACING.lg,
    },
    codeBox: {
        alignItems: "center",
        paddingVertical: SPACING.sm,
        paddingHorizontal: SPACING.lg,
        backgroundColor: COLORS.surface,
        borderRadius: RADIUS.md,
        width: "100%",
    },
    codeLabel: {
        fontSize: 12, color: COLORS.textTertiary, marginBottom: 2,
    },
    codeValue: {
        fontSize: 18, fontWeight: "700", color: COLORS.primary, letterSpacing: 2,
    },
    shareBtn: {
        flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
        backgroundColor: COLORS.primary,
        paddingVertical: 16, paddingHorizontal: 32,
        borderRadius: RADIUS.xl, width: "100%", maxWidth: 360,
        ...SHADOWS.medium,
    },
    shareText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
