import React from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ResponsiveWrapper({ children, style }) {
    const { width } = useWindowDimensions();
    const isDesktop = width > 768;

    return (
        <SafeAreaView style={[styles.safe, style]} edges={['top', 'left', 'right']}>
            <View style={[styles.outer, isDesktop && styles.outerDesktop]}>
                <View style={[styles.inner, isDesktop && styles.innerDesktop]}>
                    {children}
                </View>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: {
        flex: 1,
        backgroundColor: '#F3F4F6',
    },
    outer: {
        flex: 1,
        backgroundColor: '#F3F4F6',
    },
    outerDesktop: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 20,
    },
    inner: {
        flex: 1,
        backgroundColor: '#F3F4F6',
    },
    innerDesktop: {
        maxWidth: 480,
        width: '100%',
        borderRadius: 20,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: '#E5E7EB',
        elevation: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
    },
});
