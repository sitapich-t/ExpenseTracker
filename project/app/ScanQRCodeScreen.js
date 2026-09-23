import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, Alert } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";

export default function ScanQRCodeScreen() {
    const navigation = useNavigation();
    const [permission, requestPermission] = useCameraPermissions();
    const [scanned, setScanned] = useState(false);

    useEffect(() => {
        if (!permission) {
            requestPermission();
        }
    }, [permission]);

    if (!permission) {
        return <View style={s.safe}><Text style={{ color: '#fff' }}>กำลังขอสิทธิ์การใช้งานกล้อง...</Text></View>;
    }

    if (!permission.granted) {
        return (
            <SafeAreaView style={s.safe}>
                <View style={s.centered}>
                    <Text style={s.text}>แอปต้องการสิทธิ์การใช้งานกล้องเพื่อสแกน QR Code</Text>
                    <TouchableOpacity style={s.btn} onPress={requestPermission}>
                        <Text style={s.btnText}>อนุญาตการใช้งานกล้อง</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[s.btn, { backgroundColor: "#1E293B", marginTop: 12 }]} onPress={() => navigation.goBack()}>
                        <Text style={s.btnText}>ยกเลิก</Text>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        );
    }

    const handleBarcodeScanned = ({ type, data }) => {
        setScanned(true);
        try {
            const payload = JSON.parse(data);
            if (payload.action === "join_group" && payload.groupId) {
                Alert.alert(
                    "เข้าร่วมกลุ่ม",
                    `ต้องการเข้าร่วมกลุ่ม "${payload.groupName}" ใช่หรือไม่?`,
                    [
                        { text: "ยกเลิก", onPress: () => setScanned(false), style: "cancel" },
                        { 
                            text: "เข้าร่วม", 
                            onPress: () => {
                                // Mock join logic
                                Alert.alert("สำเร็จ", "คุณได้เข้าร่วมกลุ่มแล้ว", [
                                    { text: "ตกลง", onPress: () => navigation.navigate("GroupDetail", { groupId: payload.groupId, groupName: payload.groupName }) }
                                ]);
                            } 
                        }
                    ]
                );
            } else {
                Alert.alert("เกิดข้อผิดพลาด", "QR Code ไม่ถูกต้องหรือไม่รองรับ", [
                    { text: "ตกลง", onPress: () => setScanned(false) }
                ]);
            }
        } catch (error) {
            Alert.alert("เกิดข้อผิดพลาด", "QR Code ไม่ถูกต้อง", [
                { text: "ตกลง", onPress: () => setScanned(false) }
            ]);
        }
    };

    return (
        <SafeAreaView style={s.safe}>
            <View style={s.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
                    <Ionicons name="arrow-back" size={24} color="#fff" />
                </TouchableOpacity>
                <Text style={s.headerTitle}>สแกน QR Code</Text>
                <View style={{ width: 40 }} />
            </View>

            <View style={s.cameraContainer}>
                <CameraView
                    style={StyleSheet.absoluteFillObject}
                    facing="back"
                    onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
                    barcodeScannerSettings={{
                        barcodeTypes: ["qr"],
                    }}
                />
                <View style={s.overlay}>
                    <View style={s.scanFrame} />
                    <Text style={s.instruction}>เล็ง QR Code ให้อยู่ในกรอบเพื่อเข้าร่วมกลุ่ม</Text>
                </View>
            </View>

            {scanned && (
                <TouchableOpacity style={s.rescanBtn} onPress={() => setScanned(false)}>
                    <Text style={s.rescanText}>แตะเพื่อสแกนอีกครั้ง</Text>
                </TouchableOpacity>
            )}
        </SafeAreaView>
    );
}

const s = StyleSheet.create({
    safe: { flex: 1, backgroundColor: "#060A13" },
    centered: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
    text: { color: "#fff", fontSize: 16, textAlign: "center", marginBottom: 24 },
    btn: { backgroundColor: "#21D07A", padding: 16, borderRadius: 12, width: "100%", alignItems: "center" },
    btnText: { color: "#fff", fontSize: 16, fontWeight: "bold" },
    header: {
        flexDirection: "row", justifyContent: "space-between", alignItems: "center",
        paddingHorizontal: 16, paddingVertical: 16, zIndex: 10,
    },
    backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(30,41,59,0.8)", justifyContent: "center", alignItems: "center" },
    headerTitle: { fontSize: 20, fontWeight: "bold", color: "#fff" },
    cameraContainer: { flex: 1, position: "relative" },
    overlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: "center", alignItems: "center",
        backgroundColor: "rgba(0,0,0,0.5)"
    },
    scanFrame: {
        width: 250, height: 250,
        borderWidth: 2, borderColor: "#21D07A",
        backgroundColor: "transparent",
        borderRadius: 12,
    },
    instruction: { color: "#fff", fontSize: 16, marginTop: 40, textAlign: "center", backgroundColor: "rgba(0,0,0,0.6)", paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
    rescanBtn: {
        position: "absolute", bottom: 40, alignSelf: "center",
        backgroundColor: "#21D07A", paddingVertical: 16, paddingHorizontal: 32, borderRadius: 24,
    },
    rescanText: { color: "#fff", fontSize: 16, fontWeight: "bold" },
});
