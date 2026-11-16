import React, { useState, useEffect, useRef } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Alert, AppState, Dimensions } from "react-native";
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import { getToken, http } from "@/lib/api";
import { useGroup } from "./context/GroupContext";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

export default function ScanQRCodeScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { refresh } = useGroup();
    const [permission, requestPermission] = useCameraPermissions();
    const [scanned, setScanned] = useState(false);
    const [joining, setJoining] = useState(false);
    const [appState, setAppState] = useState(AppState.currentState);
    const isScanningLock = useRef(false);

    useEffect(() => {
        if (!permission) {
            requestPermission();
        }
    }, [permission, requestPermission]);

    useEffect(() => {
        const subscription = AppState.addEventListener("change", (nextAppState) => {
            setAppState(nextAppState);
        });
        return () => subscription.remove();
    }, []);

    const isCameraActive = appState !== "background" && appState !== "inactive";

    const resetScanner = () => {
        isScanningLock.current = false;
        setScanned(false);
    };

    if (!permission) {
        return <View style={s.safe}><Text style={{ color: '#fff' }}>กำลังขอสิทธิ์การใช้งานกล้อง...</Text></View>;
    }

    if (!permission.granted) {
        return (
            <View style={[s.safe, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
                <View style={s.centered}>
                    <Text style={s.text}>แอปต้องการสิทธิ์การใช้งานกล้องเพื่อสแกน QR Code</Text>
                    <TouchableOpacity style={s.btn} onPress={requestPermission}>
                        <Text style={s.btnText}>อนุญาตการใช้งานกล้อง</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[s.btn, { backgroundColor: "#1E293B", marginTop: 12 }]} onPress={() => router.back()}>
                        <Text style={s.btnText}>ยกเลิก</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    const handleJoin = async (payloadData) => {
        try {
            setJoining(true);
            const token = await getToken();
            const res = await http.post('/groups/join', payloadData, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.data?.success) throw new Error(res.data?.error || 'เข้าร่วมกลุ่มไม่สำเร็จ');
            await refresh();
            const targetGroupId = res.data?.group?.id || res.data?.groupId || payloadData.group_id;
            if (targetGroupId) {
                router.replace({ pathname: '/detail-group', params: { groupId: targetGroupId } });
            } else {
                router.back();
            }
        } catch (err) {
            Alert.alert("เข้าร่วมไม่สำเร็จ", err.response?.data?.error || err.message || 'ไม่สามารถเข้าร่วมกลุ่มนี้ได้', [
                { text: "ตกลง", onPress: resetScanner },
            ]);
        } finally {
            setJoining(false);
        }
    };

    const handleBarcodeScanned = ({ data }) => {
        if (isScanningLock.current || scanned) return;
        isScanningLock.current = true;
        setScanned(true);

        const raw = String(data || "").trim();

        try {
            const payload = JSON.parse(raw);
            if (payload.action === "join_group" && payload.groupId) {
                Alert.alert(
                    "พบ QR Code กลุ่ม",
                    `ต้องการเข้าร่วมกลุ่ม "${payload.groupName || 'ไม่ระบุชื่อ'}" ใช่หรือไม่?`,
                    [
                        { text: "ยกเลิก", onPress: resetScanner, style: "cancel" },
                        {
                            text: joining ? "กำลังเข้าร่วม..." : "เข้าร่วม",
                            onPress: () => handleJoin({ group_id: payload.groupId }),
                        }
                    ]
                );
                return;
            }
        } catch (_error) {
            // ข้ามไปเช็กรหัสเชิญ
        }

        const extractedCode = raw.includes("/") ? raw.split("/").pop() : raw;
        if (extractedCode && extractedCode.length >= 4 && extractedCode.length <= 20) {
            Alert.alert(
                "พบ QR Code เข้าร่วมกลุ่ม",
                `ต้องการเข้าร่วมกลุ่มด้วยรหัส "${extractedCode}" ใช่หรือไม่?`,
                [
                    { text: "ยกเลิก", onPress: resetScanner, style: "cancel" },
                    {
                        text: joining ? "กำลังเข้าร่วม..." : "เข้าร่วม",
                        onPress: () => handleJoin({ invite_code: extractedCode, code: extractedCode, group_id: extractedCode }),
                    }
                ]
            );
        } else {
            Alert.alert("QR Code ไม่ถูกต้อง", `ข้อมูลที่อ่านได้: ${raw}`, [
                { text: "ตกลง", onPress: resetScanner }
            ]);
        }
    };

    return (
        <View style={s.container}>
            {isCameraActive && (
                <CameraView
                    style={s.camera}
                    facing="back"
                    onBarcodeScanned={handleBarcodeScanned}
                    barcodeScannerSettings={{
                        barcodeTypes: ["qr"],
                    }}
                />
            )}

            {/* Header ด้านบนสุด */}
            <View style={[s.header, { top: insets.top + 8 }]}>
                <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
                    <Ionicons name="arrow-back" size={24} color="#fff" />
                </TouchableOpacity>
                <Text style={s.headerTitle}>สแกน QR Code</Text>
                <View style={{ width: 40 }} />
            </View>

            {/* กรอบสแกนบังคับอยู่ตรงกลางจอ 100% */}
            <View style={s.centerOverlay} pointerEvents="none">
                <View style={s.scanFrame} />
                <Text style={s.instruction}>เล็ง QR Code ให้อยู่ในกรอบเพื่อเข้าร่วมกลุ่ม</Text>
            </View>

            {/* ปุ่มสแกนอีกครั้งด้านล่าง */}
            {scanned && (
                <TouchableOpacity
                    style={[s.rescanBtn, { bottom: insets.bottom + 32 }]}
                    onPress={resetScanner}
                >
                    <Text style={s.rescanText}>แตะเพื่อสแกนอีกครั้ง</Text>
                </TouchableOpacity>
            )}
        </View>
    );
}

const s = StyleSheet.create({
    container: {
        width: SCREEN_WIDTH,
        height: SCREEN_HEIGHT,
        backgroundColor: "#000",
    },
    camera: {
        position: "absolute",
        top: 0,
        left: 0,
        width: SCREEN_WIDTH,
        height: SCREEN_HEIGHT,
    },
    safe: { flex: 1, backgroundColor: "#060A13" },
    centered: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
    text: { color: "#fff", fontSize: 16, textAlign: "center", marginBottom: 24 },
    btn: { backgroundColor: "#21D07A", padding: 16, borderRadius: 12, width: "100%", alignItems: "center" },
    btnText: { color: "#fff", fontSize: 16, fontWeight: "bold" },
    header: {
        position: "absolute",
        left: 0,
        right: 0,
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingHorizontal: 16,
        zIndex: 20,
    },
    backBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: "rgba(30,41,59,0.85)",
        justifyContent: "center",
        alignItems: "center",
    },
    headerTitle: { fontSize: 20, fontWeight: "bold", color: "#fff" },
    centerOverlay: {
        position: "absolute",
        top: 0,
        left: 0,
        width: SCREEN_WIDTH,
        height: SCREEN_HEIGHT,
        justifyContent: "center",
        alignItems: "center",
        zIndex: 10,
    },
    scanFrame: {
        width: 250,
        height: 250,
        borderWidth: 2.5,
        borderColor: "#21D07A",
        backgroundColor: "transparent",
        borderRadius: 16,
    },
    instruction: {
        color: "#fff",
        fontSize: 15,
        marginTop: 24,
        textAlign: "center",
        backgroundColor: "rgba(0,0,0,0.65)",
        paddingHorizontal: 18,
        paddingVertical: 10,
        borderRadius: 20,
        overflow: "hidden",
    },
    rescanBtn: {
        position: "absolute",
        alignSelf: "center",
        backgroundColor: "#21D07A",
        paddingVertical: 14,
        paddingHorizontal: 28,
        borderRadius: 24,
        zIndex: 20,
    },
    rescanText: { color: "#fff", fontSize: 16, fontWeight: "bold" },
});