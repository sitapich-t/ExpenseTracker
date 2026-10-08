// เก็บ flow token ชั่วคราว (registration_token / password_reset_token / reset_verified_token)
// ไว้ใน "หน่วยความจำของแอป" เท่านั้น — ไม่เขียนลง storage ใด ๆ
// ปิดแอป mid-flow = token หายไปเอง ไม่มี row ค้างใน DB อยู่แล้ว (stateless backend)

let flow = null;

export function setFlow(data) {
  const ttlMs = (data.expires_in || 600) * 1000;
  flow = { ...data, expiresAt: Date.now() + ttlMs };
}

export function getFlow() {
  if (!flow) return null;
  if (Date.now() >= flow.expiresAt) {
    flow = null;
    return null;
  }
  return flow;
}

export function clearFlow() {
  flow = null;
}
