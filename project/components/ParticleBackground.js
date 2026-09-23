import React, { useEffect, useRef } from "react";
import { View, StyleSheet, Animated, Dimensions } from "react-native";

const { width, height } = Dimensions.get("window");
const PARTICLE_COUNT = 30;

function Particle() {
    const x = useRef(new Animated.Value(Math.random() * width)).current;
    const y = useRef(new Animated.Value(Math.random() * height)).current;
    const size = Math.random() * 4 + 2;
    const opacity = useRef(new Animated.Value(Math.random() * 0.5 + 0.1)).current;

    useEffect(() => {
        const float = () => {
            const destX = Math.random() * width;
            const destY = Math.random() * height;
            const duration = Math.random() * 10000 + 10000;

            Animated.parallel([
                Animated.timing(x, { toValue: destX, duration, useNativeDriver: true }),
                Animated.timing(y, { toValue: destY, duration, useNativeDriver: true }),
                Animated.sequence([
                    Animated.timing(opacity, { toValue: Math.random() * 0.8 + 0.2, duration: duration / 2, useNativeDriver: true }),
                    Animated.timing(opacity, { toValue: Math.random() * 0.5 + 0.1, duration: duration / 2, useNativeDriver: true })
                ])
            ]).start(() => float());
        };
        float();
    }, []);

    return (
        <Animated.View
            style={[
                s.particle,
                {
                    width: size, height: size, borderRadius: size / 2,
                    opacity: opacity,
                    transform: [{ translateX: x }, { translateY: y }]
                }
            ]}
        />
    );
}

export default function ParticleBackground() {
    const particles = Array.from({ length: PARTICLE_COUNT });
    return (
        <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
            {particles.map((_, i) => <Particle key={i} />)}
        </View>
    );
}

const s = StyleSheet.create({
    particle: {
        position: "absolute",
        backgroundColor: "#21D07A",
        top: 0, left: 0,
    }
});
