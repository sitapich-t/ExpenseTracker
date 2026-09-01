import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = global.__API_URL__ || 'http://192.168.1.45:3000';

// ตัวเก็บ Token สำรองในกรณีที่ Native Storage บนมือถือมีปัญหา
let memoryToken = null;

export async function getToken() {
  try {
    const token = await AsyncStorage.getItem('userToken');
    return token || memoryToken;
  } catch (err) {
    return memoryToken;
  }
}

export async function setToken(token) {
  memoryToken = token;
  try {
    await AsyncStorage.setItem('userToken', token);
  } catch (err) {
    console.log('AsyncStorage Save Fallback:', err.message);
  }
}

export async function clearToken() {
  memoryToken = null;
  try {
    await AsyncStorage.removeItem('userToken');
    await AsyncStorage.removeItem('user');
  } catch (err) {}
}

async function authFetch(path, opts = {}) {
  const token = await getToken();
  const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
  if (token) headers.Authorization = `Bearer ${token}`;
  
  const res = await fetch(`${API_URL}${path}`, Object.assign({}, opts, { headers }));
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.error || 'Request failed');
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return res.json().catch(() => ({}));
}

export default {
  get: (path) => authFetch(path, { method: 'GET' }),
  post: (path, body) => authFetch(path, { method: 'POST', body: JSON.stringify(body) }),
  postForm: async (path, formData) => {
    const token = await getToken();
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${API_URL}${path}`, { method: 'POST', body: formData, headers });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const err = new Error(body.error || 'Request failed');
      err.status = res.status;
      err.body = body;
      throw err;
    }
    return res.json().catch(() => ({}));
  },
};