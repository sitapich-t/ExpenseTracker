/**
 * env.js
 * ------
 * ตรวจสอบ environment variables ที่จำเป็นตอน bootstrap
 * เรียกใช้จาก server.js เท่านั้น เพื่อไม่ให้กระทบ unit test ที่ import โมดูลอื่น
 */
const REQUIRED = ['SUPABASE_URL', 'SUPABASE_KEY', 'JWT_SECRET'];

/**
 * @param {{ exitOnError?: boolean, logger?: { error: Function } }} [options]
 * @returns {{ ok: boolean, missing: string[] }}
 */
function validateEnv(options = {}) {
  const { exitOnError = true, logger = console } = options;

  const missing = REQUIRED.filter((key) => {
    const value = process.env[key];
    return !value || !String(value).trim();
  });

  if (missing.length > 0) {
    logger.error(`❌ Missing required environment variables: ${missing.join(', ')}`);
    if (exitOnError) process.exit(1);
    return { ok: false, missing };
  }

  return { ok: true, missing: [] };
}

module.exports = { validateEnv, REQUIRED };
