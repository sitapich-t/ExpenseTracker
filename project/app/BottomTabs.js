import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";

import HomeScreen from "./HomeScreen";
import HistoryScreen from "./HistoryScreen";
import GroupListScreen from "./GroupListScreen";
import ReportScreen from "./ReportScreen";
import ProfileScreen from "./ProfileScreen";
import { COLORS } from "../theme";
import ResponsiveWrapper from "../components/ResponsiveWrapper";

const Tab = createBottomTabNavigator();

function CustomTabBar({ state, descriptors, navigation }) {
    return (
        <View style={styles.tabBarContainer}>
            <View style={styles.tabBar}>
                {state.routes.map((route, index) => {
                    const { options } = descriptors[route.key];
                    const label =
                        options.tabBarLabel !== undefined
                            ? options.tabBarLabel
                            : options.title !== undefined
                            ? options.title
                            : route.name;

                    const isFocused = state.index === index;

                    const onPress = () => {
                        const event = navigation.emit({
                            type: "tabPress",
                            target: route.key,
                            canPreventDefault: true,
                        });

                        if (!isFocused && !event.defaultPrevented) {
                            navigation.navigate(route.name);
                        }
                    };

                    // Render matching icon based on route name
                    const renderIcon = () => {
                        const iconColor = isFocused ? COLORS.primary : "#6B7280";
                        const iconSize = 24;

                        if (route.name === "หน้าแรก") {
                            return (
                                <Ionicons
                                    name={isFocused ? "home" : "home-outline"}
                                    size={iconSize}
                                    color={iconColor}
                                />
                            );
                        } else if (route.name === "รายจ่าย") {
                            return (
                                <MaterialCommunityIcons
                                    name="receipt-text-outline"
                                    size={iconSize}
                                    color={iconColor}
                                />
                            );
                        } else if (route.name === "กลุ่ม") {
                            return (
                                <MaterialCommunityIcons
                                    name="account-group-outline"
                                    size={iconSize}
                                    color={iconColor}
                                />
                            );
                        } else if (route.name === "วิเคราะห์") {
                            return (
                                <Ionicons
                                    name="bar-chart-outline"
                                    size={iconSize}
                                    color={iconColor}
                                />
                            );
                        } else if (route.name === "โปรไฟล์") {
                            return (
                                <Ionicons
                                    name="person-outline"
                                    size={iconSize}
                                    color={iconColor}
                                />
                            );
                        }
                        return <Ionicons name="apps-outline" size={iconSize} color={iconColor} />;
                    };

                    return (
                        <TouchableOpacity
                            key={route.key}
                            accessibilityRole="button"
                            accessibilityState={isFocused ? { selected: true } : {}}
                            accessibilityLabel={options.tabBarAccessibilityLabel}
                            testID={options.tabBarTestID}
                            onPress={onPress}
                            style={styles.tabItem}
                            activeOpacity={0.8}
                        >
                            <View
                                style={[
                                    styles.iconWrapper,
                                    isFocused && styles.activeIconPill,
                                ]}
                            >
                                {renderIcon()}
                            </View>
                            <Text
                                style={[
                                    styles.tabLabel,
                                    isFocused ? styles.activeTabLabel : styles.inactiveTabLabel,
                                ]}
                            >
                                {label}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </View>
        </View>
    );
}

export default function BottomTabs() {
    return (
        <Tab.Navigator
            tabBar={(props) => <CustomTabBar {...props} />}
            screenOptions={{
                headerShown: false,
            }}
        >
            <Tab.Screen name="หน้าแรก" component={HomeScreen} />
            <Tab.Screen name="รายจ่าย" component={HistoryScreen} />
            <Tab.Screen name="กลุ่ม" component={GroupListScreen} />
            <Tab.Screen name="วิเคราะห์" component={ReportScreen} />
            <Tab.Screen name="โปรไฟล์" component={ProfileScreen} />
        </Tab.Navigator>
    );
}

const styles = StyleSheet.create({
    tabBarContainer: {
        backgroundColor: COLORS.white,
        borderTopWidth: 1,
        borderTopColor: "#E5E7EB",
    },
    tabBar: {
        flexDirection: "row",
        height: 68,
        alignItems: "center",
        justifyContent: "space-around",
        paddingHorizontal: 6,
        paddingBottom: 4,
    },
    tabItem: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 4,
    },
    iconWrapper: {
        width: 44,
        height: 40,
        borderRadius: 20,
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 2,
    },
    activeIconPill: {
        backgroundColor: "#EDE9FE", // Light purple pill background matching user image
    },
    tabLabel: {
        fontSize: 12,
        fontWeight: "500",
    },
    activeTabLabel: {
        color: COLORS.primary,
        fontWeight: "700",
    },
    inactiveTabLabel: {
        color: "#6B7280",
    },
});