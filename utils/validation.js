// Validation rules for self-registration. The website applies the same rules (src/utils/validation.js)
// so the user sees errors instantly, but the backend is the one that is trusted.

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Indian mobile: 10 digits starting 6-9, optional +91 / 91 / 0 prefix. Returns "+91 98765 43210" or null. */
export function normalizeMobile(value) {
  const digits = String(value || "").replace(/[\s()-]/g, "").replace(/^(\+91|91|0)(?=\d{10}$)/, "");
  if (!/^[6-9]\d{9}$/.test(digits)) return null;
  return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
}

/** "a1203", "A 1203", "a-1203" -> "A-1203" (same format as the rest of the system). Returns null if invalid. */
export function normalizeFlat(value) {
  const m = /^([A-Z]{1,3})-?(\d{1,5})$/.exec(String(value || "").toUpperCase().replace(/\s+/g, ""));
  return m ? `${m[1]}-${m[2]}` : null;
}

/** Returns a list of unmet password rules (empty = strong enough). */
export function passwordProblems(pw = "") {
  const problems = [];
  if (pw.length < 8) problems.push("at least 8 characters");
  if (pw.length > 64) problems.push("at most 64 characters");
  if (!/[a-z]/.test(pw)) problems.push("a lowercase letter");
  if (!/[A-Z]/.test(pw)) problems.push("an uppercase letter");
  if (!/\d/.test(pw)) problems.push("a number");
  if (!/[^A-Za-z0-9]/.test(pw)) problems.push("a special character");
  return problems;
}
