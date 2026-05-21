import { getFirestoreDb } from "@/lib/firebase";
import { memberDocIdFromEmail, normalizeEmail } from "@/lib/email-utils";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";

/** Public lookup docs so sign-in/sign-up can run before Firebase Auth. */
export const AUTH_ALLOWLIST_COLLECTION = "authAllowlist";

export type AuthAllowlistSource = "project_member" | "user_profile";

export type AuthAllowlistDoc = {
  emailLower: string;
  source: AuthAllowlistSource;
  updatedAt: ReturnType<typeof serverTimestamp>;
};

export function authAllowlistDocRef(email: string) {
  const emailLower = normalizeEmail(email);
  const id = memberDocIdFromEmail(emailLower);
  return doc(getFirestoreDb(), AUTH_ALLOWLIST_COLLECTION, id);
}

export async function isEmailOnAuthAllowlist(email: string): Promise<boolean> {
  const snap = await getDoc(authAllowlistDocRef(email));
  return snap.exists();
}

/** Idempotent — admins and profile bootstrap keep roster/test emails authorized. */
export async function ensureAuthAllowlistEntry(
  email: string,
  source: AuthAllowlistSource,
): Promise<void> {
  const emailLower = normalizeEmail(email);
  if (!emailLower) return;
  await setDoc(
    authAllowlistDocRef(emailLower),
    {
      emailLower,
      source,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function syncAuthAllowlistEntries(
  emails: string[],
  source: AuthAllowlistSource,
): Promise<void> {
  const unique = [...new Set(emails.map(normalizeEmail).filter(Boolean))];
  await Promise.all(unique.map((e) => ensureAuthAllowlistEntry(e, source)));
}
