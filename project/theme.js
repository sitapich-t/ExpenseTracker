// Theme constants for Expense Tracker - Light Purple Modern Theme
export const COLORS = {
  // Primary
  primary: '#7C3AED',
  primaryDark: '#6D28D9',
  primaryLight: '#A78BFA',
  primaryBg: '#EDE9FE',
  primaryBgLight: 'rgba(124, 58, 237, 0.08)',

  // Status
  income: '#22C55E',
  incomeBg: '#DCFCE7',
  incomeBgLight: 'rgba(34, 197, 94, 0.1)',
  expense: '#EF4444',
  expenseBg: '#FEE2E2',
  expenseBgLight: 'rgba(239, 68, 68, 0.1)',
  warning: '#F59E0B',
  warningBg: '#FEF3C7',
  success: '#22C55E',
  danger: '#EF4444',
  gray: '#6B7280',
  dark: '#1F2937',

  // Backgrounds
  background: '#F3F4F6',
  white: '#FFFFFF',
  card: '#FFFFFF',
  surface: '#F9FAFB',

  // Text
  textPrimary: '#1F2937',
  textSecondary: '#6B7280',
  textTertiary: '#9CA3AF',
  textWhite: '#FFFFFF',

  // Borders
  border: '#E5E7EB',
  borderLight: '#F3F4F6',
  divider: '#E5E7EB',

  // Dark (for OTP screen etc.)
  darkBg: '#1A1A2E',
  darkCard: '#16213E',
  darkBorder: '#2A2D4A',

  // Shadows
  shadowColor: '#000',
};

export const FONTS = {
  regular: undefined,
  medium: undefined,
  bold: undefined,
  h1: { fontSize: 28, fontWeight: '700' },
  h2: { fontSize: 24, fontWeight: '700' },
  h3: { fontSize: 20, fontWeight: '600' },
  h4: { fontSize: 18, fontWeight: '600' },
  body: { fontSize: 16, fontWeight: '400' },
  bodyBold: { fontSize: 16, fontWeight: '600' },
  small: { fontSize: 14, fontWeight: '400' },
  smallBold: { fontSize: 14, fontWeight: '600' },
  caption: { fontSize: 12, fontWeight: '400' },
  captionBold: { fontSize: 12, fontWeight: '600' },
  amount: { fontSize: 36, fontWeight: '700' },
  amountLarge: { fontSize: 40, fontWeight: '700' },
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

export const RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  full: 999,
};

export const SHADOWS = {
  small: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  medium: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  large: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 6,
  },
};

// Category objects
export const CATEGORIES = {
  food: { id: 'food', emoji: '🍔', name: 'อาหารและเครื่องดื่ม', color: '#F97316' },
  transport: { id: 'transport', emoji: '🚗', name: 'เดินทาง', color: '#3B82F6' },
  housing: { id: 'housing', emoji: '🏠', name: 'ที่พัก', color: '#8B5CF6' },
  entertainment: { id: 'entertainment', emoji: '🎮', name: 'บันเทิง', color: '#EC4899' },
  shopping: { id: 'shopping', emoji: '🛍️', name: 'ช้อปปิ้ง', color: '#14B8A6' },
  education: { id: 'education', emoji: '📚', name: 'การศึกษา', color: '#6366F1' },
  health: { id: 'health', emoji: '💊', name: 'สุขภาพ', color: '#22C55E' },
  utilities: { id: 'utilities', emoji: '💡', name: 'สาธารณูปโภค', color: '#EAB308' },
  salary: { id: 'salary', emoji: '💰', name: 'เงินเดือน', color: '#22C55E' },
  freelance: { id: 'freelance', emoji: '💻', name: 'ฟรีแลนซ์', color: '#7C3AED' },
  investment: { id: 'investment', emoji: '📈', name: 'การลงทุน', color: '#0EA5E9' },
  gift: { id: 'gift', emoji: '🎁', name: 'ของขวัญ', color: '#F43F5E' },
  other: { id: 'other', emoji: '📝', name: 'อื่น ๆ', color: '#6B7280' },
};

// Array of categories for dropdowns and FlatList
export const CATEGORIES_LIST = Object.values(CATEGORIES);

// Helper for finding category
export function getCategoryInfo(idOrName) {
  if (!idOrName) return { emoji: '📝', name: 'อื่น ๆ', color: '#6B7280' };
  if (CATEGORIES[idOrName]) return CATEGORIES[idOrName];
  const found = CATEGORIES_LIST.find(c => c.name === idOrName || c.id === idOrName);
  return found || { emoji: '📝', name: idOrName, color: '#6B7280' };
}

export const GROUP_CATEGORIES = [
  { value: 'travel', label: 'ท่องเที่ยว', emoji: '✈️' },
  { value: 'food', label: 'อาหาร', emoji: '🍽️' },
  { value: 'housing', label: 'ที่พัก', emoji: '🏠' },
  { value: 'entertainment', label: 'บันเทิง', emoji: '🎬' },
  { value: 'other', label: 'อื่น ๆ', emoji: '📌' },
];

export const GROUP_COLORS = [
  '#0D9488', '#22C55E', '#3B82F6', '#7C3AED',
  '#EC4899', '#F97316', '#EF4444', '#EAB308',
];

export const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน',
  'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม',
  'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

export const THAI_MONTHS_SHORT = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.',
  'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.',
  'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
];

export const THAI_DAYS_SHORT = [
  'อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส',
];
