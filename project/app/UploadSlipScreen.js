import React, { useState, useRef } from "react";
import {
    View, Text, StyleSheet, TouchableOpacity,
    Alert, ActivityIndicator, Image
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from "../theme";
import ResponsiveWrapper from "../components/ResponsiveWrapper";

export default function UploadSlipScreen() {
    const navigation = useNavigation();
    const route = useRoute();
    const { groupId } = route.params || {};

    const [permission, requestPermission] = useCameraPermissions();
    const [facing, setFacing] = useState("back");
    const [flash, setFlash] = useState("off");
    const [processing, setProcessing] = useState(false);
    const cameraRef = useRef(null);

    const handlePickFromGallery = async () => {
        try {
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: true,
                quality: 0.8,
            });

            if (!result.canceled && result.assets && result.assets[0]) {
                processReceipt(result.assets[0].uri);
            }
        } catch (error) {
            console.log("Image picker error:", error);
            Alert.alert("ข้อผิดพลาด", "ไม่สามารถเลือกรูปภาพได้");
        }
    };

    const handleCapture = async () => {
        if (cameraRef.current) {
            try {
                setProcessing(true);
                const photo = await cameraRef.current.takePictureAsync({
                    quality: 0.8,
                });
                if (photo?.uri) {
                    processReceipt(photo.uri);
                }
            } catch (err) {
                console.log("Capture error:", err);
                Alert.alert("ข้อผิดพลาด", "ไม่สามารถถ่ายภาพได้");
            } finally {
                setProcessing(false);
            }
        }
    };

    const processReceipt = (imageUri) => {
        // Simulated OCR Processing - extracts realistic receipt data
        navigation.navigate("ScanResult", {
            imageUri,
            groupId,
            storeName: "Starbucks Cafe (สยาม)",
            storeCategory: "food",
            totalAmount: 235.00,
            items: [
                { name: "Iced Caramel Macchiato", price: 150.00 },
                { name: "Chocolate Croissant", price: 85.00 },
            ],
            date: new Date().toISOString(),
        });
    };

    if (!permission) {
        return (
            <ResponsiveWrapper>
                <View style={s.center}>
                    <ActivityIndicator size="large" color={COLORS.primary} />
                </View>
            </ResponsiveWrapper>
        );
    }

    if (!permission.granted) {
        return (
            <ResponsiveWrapper>
                <View style={s.permissionContainer}>
                    <Ionicons name="camera-outline" size={64} color={COLORS.primary} />
                    <Text style={s.permTitle}>ต้องการสิทธิ์การเข้าถึงกล้อง</Text>
                    <Text style={s.permSubtitle}>กรุณาอนุญาตให้แอปพลิเคชันเข้าถึงกล้องเพื่อสแกนใบเสร็จ</Text>
                    <TouchableOpacity style={s.permBtn} onPress={requestPermission}>
                        <Text style={s.permBtnText}>อนุญาตการเข้าถึงกล้อง</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.galleryBtnAlt} onPress={handlePickFromGallery}>
                        <Ionicons name="images-outline" size={20} color={COLORS.primary} />
                        <Text style={s.galleryBtnAltText}>เลือกรูปจากแกลเลอรี</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.backAltBtn} onPress={() => navigation.goBack()}>
                        <Text style={s.backAltText}>ย้อนกลับ</Text>
                    </TouchableOpacity>
                </View>
            </ResponsiveWrapper>
        );
    }

    return (
        <View style={s.container}>
            {/* Top Bar */}
            <View style={s.topBar}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={s.iconBtn}>
                    <Ionicons name="close" size={26} color="#fff" />
                </TouchableOpacity>
                <Text style={s.screenTitle}>สแกนใบเสร็จ</Text>
                <TouchableOpacity 
                    onPress={() => setFlash(flash === "off" ? "on" : "off")} 
                    style={s.iconBtn}
                >
                    <Ionicons 
                        name={flash === "on" ? "flash" : "flash-off"} 
                        size={22} 
                        color={flash === "on" ? "#F59E0B" : "#fff"} 
                    />
                </TouchableOpacity>
            </View>

            {/* Camera Viewfinder */}
            <View style={s.cameraContainer}>
                <CameraView
                    ref={cameraRef}
                    style={StyleSheet.absoluteFillObject}
                    facing={facing}
                    enableTorch={flash === "on"}
                />

                {/* Scannable Frame Overlay */}
                <View style={s.overlay}>
                    <View style={s.hintTag}>
                        <Ionicons name="scan-outline" size={16} color="#fff" />
                        <Text style={s.hintText}>จัดวางใบเสร็จให้อยู่ในกรอบ</Text>
                    </View>

                    <View style={s.scanFrame}>
                        <View style={[s.corner, s.topLeft]} />
                        <View style={[s.corner, s.topRight]} />
                        <View style={[s.corner, s.bottomLeft]} />
                        <View style={[s.corner, s.bottomRight]} />
                    </View>
                </View>
            </View>

            {/* Bottom Controls */}
            <View style={s.bottomControls}>
                <TouchableOpacity style={s.galleryBtn} onPress={handlePickFromGallery}>
                    <Ionicons name="images" size={26} color="#fff" />
                </TouchableOpacity>

                <TouchableOpacity 
                    style={s.shutterOuter} 
                    onPress={handleCapture}
                    disabled={processing}
                >
                    <View style={s.shutterInner}>
                        {processing ? (
                            <ActivityIndicator size="small" color="#fff" />
                        ) : (
                            <Ionicons name="camera" size={32} color="#fff" />
                        )}
                    </View>
                </TouchableOpacity>

                <TouchableOpacity 
                    style={s.switchCamBtn} 
                    onPress={() => setFacing(facing === "back" ? "front" : "back")}
                >
                    <Ionicons name="camera-reverse" size={26} color="#fff" />
                </TouchableOpacity>
            </View>
        </View>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: "#000" },
    center: { flex: 1, justifyContent: "center", alignItems: "center" },
    topBar: {
        position: "absolute", top: 40, left: 0, right: 0, zIndex: 10,
        flexDirection: "row", justifyContent: "space-between", alignItems: "center",
        paddingHorizontal: SPACING.lg,
    },
    iconBtn: {
        width: 44, height: 44, borderRadius: 22,
        backgroundColor: "rgba(0,0,0,0.5)",
        justifyContent: "center", alignItems: "center",
    },
    screenTitle: {
        fontSize: 18, fontWeight: "600", color: "#fff",
    },
    cameraContainer: {
        flex: 1, position: "relative",
    },
    overlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: "center", alignItems: "center",
    },
    hintTag: {
        flexDirection: "row", alignItems: "center", gap: 6,
        backgroundColor: "rgba(124, 58, 237, 0.75)",
        paddingVertical: 6, paddingHorizontal: 16,
        borderRadius: RADIUS.full, marginBottom: 24,
    },
    hintText: {
        color: "#fff", fontSize: 13, fontWeight: "500",
    },
    scanFrame: {
        width: 280, height: 400,
        borderRadius: RADIUS.lg,
        borderWidth: 2, borderColor: "rgba(167, 139, 250, 0.8)",
        position: "relative",
        backgroundColor: "rgba(255,255,255,0.05)",
    },
    corner: {
        position: "absolute", width: 24, height: 24,
        borderColor: COLORS.primary, borderWidth: 4,
    },
    topLeft: { top: -2, left: -2, borderBottomWidth: 0, borderRightWidth: 0, borderTopLeftRadius: RADIUS.lg },
    topRight: { top: -2, right: -2, borderBottomWidth: 0, borderLeftWidth: 0, borderTopRightRadius: RADIUS.lg },
    bottomLeft: { bottom: -2, left: -2, borderTopWidth: 0, borderRightWidth: 0, borderBottomLeftRadius: RADIUS.lg },
    bottomRight: { bottom: -2, right: -2, borderTopWidth: 0, borderLeftWidth: 0, borderBottomRightRadius: RADIUS.lg },

    bottomControls: {
        position: "absolute", bottom: 40, left: 0, right: 0,
        flexDirection: "row", justifyContent: "space-around", alignItems: "center",
        paddingHorizontal: SPACING.xl,
    },
    galleryBtn: {
        width: 52, height: 52, borderRadius: 26,
        backgroundColor: "rgba(255,255,255,0.2)",
        justifyContent: "center", alignItems: "center",
    },
    shutterOuter: {
        width: 80, height: 80, borderRadius: 40,
        borderWidth: 4, borderColor: "#fff",
        justifyContent: "center", alignItems: "center",
        backgroundColor: "rgba(255,255,255,0.2)",
    },
    shutterInner: {
        width: 64, height: 64, borderRadius: 32,
        backgroundColor: COLORS.primary,
        justifyContent: "center", alignItems: "center",
    },
    switchCamBtn: {
        width: 52, height: 52, borderRadius: 26,
        backgroundColor: "rgba(255,255,255,0.2)",
        justifyContent: "center", alignItems: "center",
    },
    permissionContainer: {
        flex: 1, justifyContent: "center", alignItems: "center",
        padding: SPACING.xxl, backgroundColor: COLORS.background,
    },
    permTitle: { fontSize: 20, fontWeight: "700", color: COLORS.textPrimary, marginTop: 16, textAlign: "center" },
    permSubtitle: { fontSize: 14, color: COLORS.textSecondary, marginTop: 8, textAlign: "center", lineHeight: 20 },
    permBtn: {
        marginTop: 24, backgroundColor: COLORS.primary,
        paddingVertical: 14, paddingHorizontal: 28, borderRadius: RADIUS.xl,
    },
    permBtnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
    galleryBtnAlt: {
        flexDirection: "row", alignItems: "center", gap: 8,
        marginTop: 16, paddingVertical: 12, paddingHorizontal: 20,
        borderRadius: RADIUS.xl, borderWidth: 1, borderColor: COLORS.primary,
    },
    galleryBtnAltText: { color: COLORS.primary, fontSize: 15, fontWeight: "600" },
    backAltBtn: { marginTop: 16 },
    backAltText: { color: COLORS.textSecondary, fontSize: 14 },
});
