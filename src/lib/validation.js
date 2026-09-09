export const REG_NO_PATTERN = /^eg\/20\d{2}\/\d{4}$/i;

export function validateRegistrationNo(regNo) {
  return REG_NO_PATTERN.test(regNo);
}

export function normalizeRegNo(regNo) {
  return regNo.toUpperCase();
}

// Strip formatting characters so numbers are stored consistently.
export function normalizePhone(phone) {
  if (typeof phone !== 'string') return '';
  const trimmed = phone.trim();
  if (!trimmed) return '';
  const plus = trimmed.startsWith('+') ? '+' : '';
  return plus + trimmed.replace(/\D/g, '');
}

// Accepts local or international numbers: 9–15 digits with an optional '+'.
// Empty values are valid so the field remains optional.
export function validatePhone(phone) {
  const normalized = normalizePhone(phone);
  if (!normalized) return true;
  return /^\+?\d{9,15}$/.test(normalized);
}

// Restrict user-supplied URLs to http(s) only.
// Prevents javascript:, data:, file:, and other scheme-injection payloads
// from being persisted and later rendered as clickable links.
// Empty strings/undefined return true so callers can treat the URL as optional.
export function isValidUrl(str) {
  if (!str) return true;
  if (typeof str !== 'string') return false;
  try {
    const url = new URL(str);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}
