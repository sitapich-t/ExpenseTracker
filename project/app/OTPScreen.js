import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { FONTS, SPACING, RADIUS } from '../theme';
import ResponsiveWrapper from '../components/ResponsiveWrapper';

// Dark theme specific colors for this screen
const DARK_THEME = {
  background: '#1A1A2E',
  surface: '#252542',
  text: '#FFFFFF',
  textSecondary: '#A0A0B0',
  primary: '#7C3AED', // Match app primary
  border: '#3A3A5A',
  error: '#FF4C4C',
};

export default function OTPScreen() {
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [timer, setTimer] = useState(30);
  const inputRefs = useRef([]);
  const navigation = useNavigation();

  useEffect(() => {
    let interval = null;
    if (timer > 0) {
      interval = setInterval(() => {
        setTimer((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [timer]);

  const handleOtpChange = (text, index) => {
    // Only allow numbers
    const cleanText = text.replace(/[^0-9]/g, '');
    
    if (cleanText.length <= 1) {
      const newOtp = [...otp];
      newOtp[index] = cleanText;
      setOtp(newOtp);

      // Auto-advance to next input
      if (cleanText.length === 1 && index < 5) {
        inputRefs.current[index + 1]?.focus();
      }
    }
  };

  const handleKeyPress = (e, index) => {
    if (e.nativeEvent.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
      // Also clear the previous input when navigating back
      const newOtp = [...otp];
      newOtp[index - 1] = '';
      setOtp(newOtp);
    }
  };

  const handleVerify = () => {
    const otpValue = otp.join('');
    if (otpValue.length === 6) {
      // In a real app, call API to verify
      navigation.replace('Login');
    }
  };

  const handleResend = () => {
    if (timer === 0) {
      setTimer(30);
      setOtp(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
      // Call API to resend OTP
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <ResponsiveWrapper>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          style={styles.container}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity 
              style={styles.backButton}
              onPress={() => navigation.goBack()}
            >
              <Ionicons name="arrow-back" size={24} color={DARK_THEME.text} />
            </TouchableOpacity>
          </View>

          <View style={styles.content}>
            {/* Title & Description */}
            <View style={styles.textContainer}>
              <Text style={styles.title}>ยืนยันรหัส OTP</Text>
              <Text style={styles.description}>
                เราได้ส่งรหัสยืนยันไปที่อีเมลที่ใช้สมัคร
              </Text>
              <Text style={styles.maskedEmail}>
                และอีเมลที่ลงท้ายด้วย 08X-XXX-X456
              </Text>
            </View>

            {/* OTP Inputs */}
            <View style={styles.otpContainer}>
              {otp.map((digit, index) => (
                <TextInput
                  key={index}
                  ref={(ref) => (inputRefs.current[index] = ref)}
                  style={[
                    styles.otpInput,
                    digit !== '' && styles.otpInputFilled,
                    { borderColor: digit !== '' ? DARK_THEME.primary : DARK_THEME.border }
                  ]}
                  value={digit}
                  onChangeText={(text) => handleOtpChange(text, index)}
                  onKeyPress={(e) => handleKeyPress(e, index)}
                  keyboardType="number-pad"
                  maxLength={1}
                  autoFocus={index === 0}
                  selectionColor={DARK_THEME.primary}
                />
              ))}
            </View>

            {/* Verify Button */}
            <TouchableOpacity
              style={[
                styles.verifyButton,
                otp.join('').length !== 6 && styles.verifyButtonDisabled
              ]}
              onPress={handleVerify}
              disabled={otp.join('').length !== 6}
            >
              <Text style={styles.verifyButtonText}>ยืนยันรหัส OTP</Text>
            </TouchableOpacity>

            {/* Resend Section */}
            <View style={styles.resendContainer}>
              <Text style={styles.resendText}>ไม่ได้รับรหัสยืนยันใช่ไหม? </Text>
              <TouchableOpacity onPress={handleResend} disabled={timer > 0}>
                <Text style={[
                  styles.resendLink,
                  timer > 0 && styles.resendLinkDisabled
                ]}>
                  ส่งรหัสอีกครั้ง {timer > 0 ? `(${formatTime(timer)})` : ''}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ResponsiveWrapper>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: DARK_THEME.background,
  },
  container: {
    flex: 1,
    backgroundColor: DARK_THEME.background,
  },
  header: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  content: {
    flex: 1,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.xl,
  },
  textContainer: {
    marginBottom: SPACING.xxl,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: DARK_THEME.text,
    marginBottom: SPACING.md,
  },
  description: {
    fontSize: FONTS.body,
    color: DARK_THEME.textSecondary,
    marginBottom: SPACING.xs,
  },
  maskedEmail: {
    fontSize: FONTS.body,
    color: DARK_THEME.text,
    fontWeight: '500',
  },
  otpContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.xxl,
  },
  otpInput: {
    width: 50,
    height: 60,
    backgroundColor: DARK_THEME.surface,
    borderWidth: 1.5,
    borderColor: DARK_THEME.border,
    borderRadius: RADIUS.md,
    color: DARK_THEME.text,
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  otpInputFilled: {
    borderColor: DARK_THEME.primary,
    backgroundColor: 'rgba(124, 58, 237, 0.1)', // Light primary tint
  },
  verifyButton: {
    backgroundColor: DARK_THEME.primary,
    height: 56,
    borderRadius: RADIUS.lg,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  verifyButtonDisabled: {
    backgroundColor: DARK_THEME.border,
    opacity: 0.7,
  },
  verifyButtonText: {
    color: DARK_THEME.text,
    fontSize: FONTS.button,
    fontWeight: 'bold',
  },
  resendContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  resendText: {
    color: DARK_THEME.textSecondary,
    fontSize: FONTS.body,
  },
  resendLink: {
    color: DARK_THEME.primary,
    fontSize: FONTS.body,
    fontWeight: 'bold',
  },
  resendLinkDisabled: {
    color: DARK_THEME.textSecondary,
    fontWeight: 'normal',
  },
});
