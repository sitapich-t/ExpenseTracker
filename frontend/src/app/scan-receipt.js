import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

export default function ScanReceiptScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (!permission) requestPermission();
  }, []);

  const handlePickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]?.uri) {
      processOCR(result.assets[0].uri);
    }
  };

  const handleTakePhoto = async () => {
    // ในที่นี้สมมติถ่ายรูปสำเร็จแล้วส่งไปประมวลผล OCR
    const sampleUri = 'https://via.placeholder.com/300';
    processOCR(sampleUri);
  };

  const processOCR = (imageUri) => {
    // ส่งรูปไปที่หน้า Confirm พร้อม query หรือ params
    router.push({
      pathname: '/confirm-receipt',
      params: { 
        imageUri,
        merchant: 'Starbucks',
        amount: '5.50',
        date: '2023-10-24',
        category: 'Food & Drink'
      }
    });
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
      <CameraView style={StyleSheet.absoluteFillObject} enableTorch={flash}>
        {/* Top Controls */}
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.iconCircle} onPress={() => router.back()}>
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.topTitle}>Scan Receipt</Text>
          <TouchableOpacity style={styles.iconCircle} onPress={() => setFlash(!flash)}>
            <MaterialCommunityIcons name={flash ? "flash" : "flash-off"} size={22} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Guidance Overlay */}
        <View style={styles.guideContainer}>
          <View style={styles.pillBadge}>
            <MaterialCommunityIcons name="scan-helper" size={16} color="#c4b5fd" />
            <Text style={styles.pillText}>Position receipt within the frame</Text>
          </View>
          
          {/* Target Scanning Box */}
          <View style={styles.scanFrame}>
            <View style={[styles.corner, styles.topLeft]} />
            <View style={[styles.corner, styles.topRight]} />
            <View style={[styles.corner, styles.bottomLeft]} />
            <View style={[styles.corner, styles.bottomRight]} />
          </View>
        </View>

        {/* Bottom Actions */}
        <View style={styles.bottomBar}>
          <TouchableOpacity style={styles.bottomIconBtn} onPress={handlePickImage}>
            <Ionicons name="images-outline" size={24} color="#fff" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.captureOuter} onPress={handleTakePhoto}>
            <View style={styles.captureInner} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.bottomIconBtn} onPress={() => {}}>
            <MaterialCommunityIcons name="file-document-edit-outline" size={24} color="#fff" />
          </TouchableOpacity>
        </View>
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
  permBtn: { backgroundColor: '#5f3dc4', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10 },
  topBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: 50, paddingHorizontal: 20
  },
  iconCircle: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.4)',
    justify: 'center', alignItems: 'center'
  },
  topTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  
  guideContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  pillBadge: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(20,15,35,0.7)',
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, marginBottom: 20
  },
  pillText: { color: '#ddd', fontSize: 13, marginLeft: 6 },
  scanFrame: {
    width: '80%', height: '60%', borderWidth: 2, borderColor: '#7c3aed',
    borderRadius: 24, position: 'relative', backgroundColor: 'rgba(255,255,255,0.05)'
  },
  corner: { position: 'absolute', width: 20, height: 20, borderColor: '#a78bfa' },
  topLeft: { top: -2, left: -2, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 16 },
  topRight: { top: -2, right: -2, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 16 },
  bottomLeft: { bottom: -2, left: -2, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 16 },
  bottomRight: { bottom: -2, right: -2, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 16 },

  bottomBar: {
    flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center',
    paddingBottom: 40, paddingHorizontal: 20
  },
  bottomIconBtn: {
    width: 50, height: 50, borderRadius: 25, backgroundColor: 'rgba(255,255,255,0.2)',
    justify: 'center', alignItems: 'center'
  },
  captureOuter: {
    width: 76, height: 76, borderRadius: 38, borderWidth: 4, borderColor: '#a78bfa',
    justify: 'center', alignItems: 'center'
  },
  captureInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#7c3aed' }
});