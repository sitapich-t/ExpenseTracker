export const digitsOnly = (value) => String(value ?? '').replace(/[^0-9]/g, '');

export const decimalOnly = (value) => {
  const cleaned = String(value ?? '').replace(/[^0-9.]/g, '');
  const [whole, ...fraction] = cleaned.split('.');
  return fraction.length > 0 ? `${whole}.${fraction.join('')}` : whole;
};
