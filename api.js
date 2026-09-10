import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";

// 1. กำหนด IP กลางจุดเดียว (หากใช้ Android Emulator ให้ใช้ 10.0.2.2)
// หากทดสอบบนเครื่องจริง ให้เปลี่ยนเป็น IP วง LAN ของเครื่อง เช่น 'http://192.168.1.XX:3000'
export const API_URL = global.__API_URL__ || "http://10.0.2.2:3000";
export const API_V1 = `${API_URL}/api/v1`;

// Axios instance ตัวกลาง
export const http = axios.create({ baseURL: API_V1 });

http.interceptors.request.use((config) => {
  console.log("[API →]", config.method?.toUpperCase(), config.url);
  return config;
});

http.interceptors.response.use(
  (res) => {
    console.log("[API ←]", res.status, res.config?.url);
    return res;
  },
  (err) => {
    const url = err.config ? err.config.url : "(no config)";
    const status = err.response ? err.response.status : "NETWORK";
    const body = err.response ? err.response.data : err.message;

    console.error(
      "[API ✗]",
      status,
      url,
      typeof body === "string" ? body : JSON.stringify(body),
    );

    return Promise.reject(err);
  }
);

// ตัวเก็บ Token
let memoryToken = null;

export async function getToken() {
  try {
    const token = await AsyncStorage.getItem("userToken");
    return token || memoryToken;
  } catch {
    return memoryToken;
  }
}

export async function setToken(token) {
  memoryToken = token;
  try {
    await AsyncStorage.setItem("userToken", token);
  } catch (err) {
    console.log("AsyncStorage Save Fallback:", err.message);
  }
}

export async function clearToken() {
  memoryToken = null;
  try {
    await AsyncStorage.removeItem("userToken");
    await AsyncStorage.removeItem("user");
  } catch {}
}

function logApiFailure(method, path, err) {
  const status = err.status || (err.response && err.response.status) || "NETWORK";
  const body = err.body || (err.response && err.response.data) || err.message;

  console.error(
    "[API ✗]",
    method,
    status,
    `${API_URL}${path}`,
    typeof body === "string" ? body : JSON.stringify(body)
  );
}

async function authFetch(path, opts = {}) {
  const token = await getToken();
  const headers = Object.assign(
    { "Content-Type": "application/json" },
    opts.headers || {}
  );

  if (token) headers.Authorization = `Bearer ${token}`;

  // ตรวจสอบ path ไม่ให้พา URL ซ้ำซ้อน
  const fullUrl = path.startsWith("http") ? path : `${API_URL}${path}`;

  let res;
  try {
    res = await fetch(fullUrl, Object.assign({}, opts, { headers }));
  } catch (err) {
    logApiFailure(opts.method || "GET", path, err);
    throw err;
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.error || "Request failed");
    err.status = res.status;
    err.body = body;

    logApiFailure(opts.method || "GET", path, err);
    throw err;
  }

  return res.json().catch(() => ({}));
}

export default {
  get: (path) => authFetch(path, { method: "GET" }),
  post: (path, body) =>
    authFetch(path, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  postForm: async (path, formData) => {
    const token = await getToken();
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;

    const fullUrl = path.startsWith("http") ? path : `${API_URL}${path}`;

    let res;
    try {
      res = await fetch(fullUrl, {
        method: "POST",
        body: formData,
        headers,
      });
    } catch (err) {
      logApiFailure("POST", path, err);
      throw err;
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const err = new Error(body.error || "Request failed");
      err.status = res.status;
      err.body = body;

      logApiFailure("POST", path, err);
      throw err;
    }

    return res.json().catch(() => ({}));
  },
};