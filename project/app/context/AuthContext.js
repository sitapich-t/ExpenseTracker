import React, { createContext, useContext, useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const DEFAULT_USER = {
    id: 1,
    name: "peet",
    username: "peet",
    email: "peet@email.com",
    phone: "098-765-4321",
    studentId: "pt1569",
    birthDate: "15/03/2003",
    avatar: "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=400&q=80",
};

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [currentUser, setCurrentUser] = useState(DEFAULT_USER);
    const [loading, setLoading] = useState(true);

    // ─── โหลด session จาก AsyncStorage เมื่อ app เริ่ม ───────────────────
    useEffect(() => {
        AsyncStorage.getItem("user")
            .then((json) => {
                if (json) {
                    setCurrentUser(JSON.parse(json));
                } else {
                    setCurrentUser(DEFAULT_USER);
                }
            })
            .catch(() => setCurrentUser(DEFAULT_USER))
            .finally(() => setLoading(false));
    }, []);

    // ─── บันทึก user หลัง login สำเร็จ ──────────────────────────────────
    const login = async (userObj) => {
        const fullUser = {
            ...DEFAULT_USER,
            ...userObj,
            name: userObj.username || userObj.name || DEFAULT_USER.name,
            username: userObj.username || userObj.name || DEFAULT_USER.username,
        };
        setCurrentUser(fullUser);
        await AsyncStorage.setItem("user", JSON.stringify(fullUser));
    };

    // ─── อัปเดตข้อมูล user ────────────────────────────────────────────────
    const updateUser = async (updatedFields) => {
        const updated = { ...(currentUser || DEFAULT_USER), ...updatedFields };
        setCurrentUser(updated);
        await AsyncStorage.setItem("user", JSON.stringify(updated));
        return updated;
    };

    // ─── ล้าง session เมื่อ logout ────────────────────────────────────────
    const logout = async () => {
        setCurrentUser(null);
        await AsyncStorage.removeItem("user");
    };

    return (
        <AuthContext.Provider value={{ 
            currentUser, 
            user: currentUser, 
            loading, 
            login, 
            updateUser,
            logout 
        }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    return useContext(AuthContext);
}
