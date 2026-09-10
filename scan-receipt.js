import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useRouter } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { setScannedImage } from '../utils/scannedImageStore'; // ปรับ path ให้ตรงกับตำแหน่งไฟล์จริงในโปรเจกต์

export default function ScanReceiptScreen() {
  const router = useRouter();
  const cameraRef = useRef(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [flash, setFlash] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!permission) requestPermission();
  }, []);

  const handlePickImage = async () => {
    if (loading) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 1,
    });

    if (!result.canceled && result.assets[0]?.uri) {
      // ใช้ URI ต้นฉบับจาก ImagePicker ตรงๆ ไม่ต้อง copy ไปที่ documentDirectory
      // (การ copy ผ่าน legacy FileSystem API เจอปัญหาไฟล์หายระหว่างทางใน Expo Go)
      processOCR(result.assets[0].uri);
    }
  };

  const handleTakePhoto = async () => {
    if (loading) return;
    try {
      if (!cameraRef.current) return;
      const photo = await cameraRef.current.takePictureAsync({ quality: 1 });
      if (photo?.uri) {
        // ใช้ URI ต้นฉบับจากกล้องตรงๆ ไม่ต้อง copy ไปที่ documentDirectory
        processOCR(photo.uri);
      }
    } catch (error) {
      Alert.alert('ข้อผิดพลาด', 'ไม่สามารถถ่ายภาพได้ กรุณาลองใหม่อีกครั้ง');
    }
  };

  const processOCR = async (imageUri) => {
    setLoading(true);
    try {
      const base64Image = await FileSystem.readAsStringAsync(imageUri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const response = await fetch('http://10.40.130.210:3000/api/transactions/scan-receipt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image: base64Image,
        }),
      });

      const resultText = await response.text();

      let data;
      try {
        data = JSON.parse(resultText);
      } catch (e) {
        data = null;
      }

      if (!response.ok) {
        const backendMessage = data?.message || data?.error || `HTTP ${response.status}`;
        throw new Error(backendMessage);
      }

      if (!data) {
        throw new Error('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง');
      }

      // เก็บรูปเป็น base64 data URI ไว้ใน memory (ไม่ใช้ file/content URI ที่โดน
      // bug ของ Expo Go) แล้วให้หน้า confirm-receipt ดึงมาใช้ตรงๆ ผ่าน getScannedImage()
      setScannedImage(`data:image/jpeg;base64,${base64Image}`);

      // ส่งข้อมูลอื่นๆ ไปยัง confirm-receipt ผ่าน params ตามปกติ (ไม่ใช่รูป)
      router.push({
        pathname: '/confirm-receipt',
        params: {
          merchant: data.merchant || '',
          amount: data.total != null ? String(data.total) : '',
          date: data.date || '',
          parsedText: data.parsedText || '',
          category: data.documentType === 'transfer_slip' ? 'Transfer' : 'Food & Drink',
          documentType: data.documentType || 'receipt',
          bankName: data.bankName || '',
          transactionId: data.transactionId || '',
        },
      });
    } catch (error) {
      Alert.alert(
        'การสแกนล้มเหลว',
        error.message || 'ไม่สามารถอ่านข้อมูลใบเสร็จได้ กรุณาตรวจสอบว่าเซิร์ฟเวอร์ Backend รันอยู่หรือลองใหม่อีกครั้ง'
      );
    } finally {
      setLoading(false);
    }
  };

  if (!permission?.granted) {
    return (
      <View style={styles.centerContainer}>
        <Text style={{ marginBottom: 16 }}>ต้องอนุญาตเข้าถึงกล้องถ่ายรูป</Text>
        <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
          <Text style={{ color: '#fff', fontWeight: 'bold' }}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFillObject} enableTorch={flash} />

      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#a78bfa" />
          <Text style={styles.loadingText}>กำลังอ่านข้อมูลใบเสร็จ...</Text>
        </View>
      )}

      <View style={styles.topBar}>
        <TouchableOpacity style={styles.iconCircle} onPress={() => router.back()}>
          <Ionicons name="close" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.topTitle}>Scan Receipt</Text>
        <TouchableOpacity style={styles.iconCircle} onPress={() => setFlash(!flash)}>
          <MaterialCommunityIcons name={flash ? 'flash' : 'flash-off'} size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={styles.guideContainer}>
        <View style={styles.pillBadge}>
          <MaterialCommunityIcons name="scan-helper" size={16} color="#c4b5fd" />
          <Text style={styles.pillText}>Position receipt within the frame</Text>
        </View>
        <View style={styles.scanFrame}>
          <View style={[styles.corner, styles.topLeft]} />
          <View style={[styles.corner, styles.topRight]} />
          <View style={[styles.corner, styles.bottomLeft]} />
          <View style={[styles.corner, styles.bottomRight]} />
        </View>
      </View>

      <View style={styles.bottomBar}>
        <TouchableOpacity style={styles.bottomIconBtn} onPress={handlePickImage} disabled={loading}>
          <Ionicons name="images-outline" size={24} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity style={[styles.captureOuter, loading && { opacity: 0.5 }]} onPress={handleTakePhoto} disabled={loading}>
          <View style={styles.captureInner} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.bottomIconBtn} onPress={() => {}} disabled={loading}>
          <MaterialCommunityIcons name="file-document-edit-outline" size={24} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
  permBtn: { backgroundColor: '#5f3dc4', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10 },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
  },
  loadingText: { color: '#fff', marginTop: 12, fontSize: 16, fontWeight: '600' },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 50, paddingHorizontal: 20 },
  iconCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  topTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  guideContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  pillBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(20,15,35,0.7)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, marginBottom: 20 },
  pillText: { color: '#ddd', fontSize: 13, marginLeft: 6 },
  scanFrame: { width: '80%', height: '60%', borderWidth: 2, borderColor: '#7c3aed', borderRadius: 24, position: 'relative', backgroundColor: 'rgba(255,255,255,0.05)' },
  corner: { position: 'absolute', width: 20, height: 20, borderColor: '#a78bfa' },
  topLeft: { top: -2, left: -2, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 16 },
  topRight: { top: -2, right: -2, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 16 },
  bottomLeft: { bottom: -2, left: -2, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 16 },
  bottomRight: { bottom: -2, right: -2, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 16 },
  bottomBar: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', paddingBottom: 40, paddingHorizontal: 20 },
  bottomIconBtn: { width: 50, height: 50, borderRadius: 25, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
  captureOuter: { width: 76, height: 76, borderRadius: 38, borderWidth: 4, borderColor: '#a78bfa', justifyContent: 'center', alignItems: 'center' },
  captureInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#7c3aed' }
});