/** Shared email normalization and format checks for auth and project roster. */

const EMAIL_FORMAT_RE =
  /^[a-z0-9](?:[a-z0-9._%+-]{0,62}[a-z0-9])?@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

const MAX_EMAIL_LEN = 254;

/** Domains commonly used for throwaway / fake signups (subset). */
const DISPOSABLE_EMAIL_DOMAINS = new Set([
  "mailinator.com",
  "guerrillamail.com",
  "guerrillamail.net",
  "guerrillamail.org",
  "sharklasers.com",
  "grr.la",
  "tempmail.com",
  "temp-mail.org",
  "throwaway.email",
  "yopmail.com",
  "trashmail.com",
  "getnada.com",
  "maildrop.cc",
  "fakeinbox.com",
  "dispostable.com",
  "mailnesia.com",
  "tempail.com",
  "emailondeck.com",
  "mintemail.com",
  "mytemp.email",
  "10minutemail.com",
  "20minutemail.com",
  "mailcatch.com",
  "spamgourmet.com",
  "mailnull.com",
  "discard.email",
  "inboxkitten.com",
  "tmpmail.net",
  "tmpmail.org",
]);

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function emailDomain(emailLower: string): string {
  const at = emailLower.lastIndexOf("@");
  return at >= 0 ? emailLower.slice(at + 1) : "";
}

/** Stricter than a bare @ check — blocks obvious typos and invalid hosts. */
export function isValidEmailFormat(email: string): boolean {
  const lower = normalizeEmail(email);
  if (!lower || lower.length > MAX_EMAIL_LEN) return false;
  if (lower.includes("..") || lower.startsWith("@") || lower.endsWith("@")) {
    return false;
  }
  return EMAIL_FORMAT_RE.test(lower);
}

export function isDisposableEmailDomain(email: string): boolean {
  const domain = emailDomain(normalizeEmail(email));
  if (!domain) return true;
  return DISPOSABLE_EMAIL_DOMAINS.has(domain);
}

/** Safe Firestore document id derived from email (used for members + authAllowlist). */
export function memberDocIdFromEmail(email: string): string {
  const lower = normalizeEmail(email);
  return lower.replace(/@/g, "_at_").replace(/\./g, "_");
}
