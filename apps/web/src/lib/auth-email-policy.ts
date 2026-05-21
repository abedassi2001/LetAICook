import type { User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { isEmailOnAuthAllowlist } from "@/lib/auth-allowlist";
import {
  isDisposableEmailDomain,
  isValidEmailFormat,
  normalizeEmail,
} from "@/lib/email-utils";
import { getFirestoreDb } from "@/lib/firebase";
import { USERS_COLLECTION } from "@/lib/user-model";

export const AUTH_EMAIL_NOT_AUTHORIZED =
  "This email is not authorized to use letAIcook. Ask your team lead to add you on a project roster, or sign in with an account your team already registered.";

export const AUTH_EMAIL_INVALID =
  "Enter a valid email address (for example name@company.com).";

export const AUTH_EMAIL_DISPOSABLE =
  "Disposable email addresses are not allowed. Use your work email or an address your team added to a project.";

export const AUTH_EMAIL_MISSING =
  "Your account has no email address. Use email/password or Google with a valid email.";

function skipAllowlistInDev(): boolean {
  return (
    process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === "true" &&
    process.env.NEXT_PUBLIC_AUTH_SKIP_EMAIL_ALLOWLIST === "true"
  );
}

function rejectInvalidOrDisposable(emailLower: string): void {
  if (!isValidEmailFormat(emailLower)) {
    throw new Error(AUTH_EMAIL_INVALID);
  }
  if (isDisposableEmailDomain(emailLower)) {
    throw new Error(AUTH_EMAIL_DISPOSABLE);
  }
}

/** Before Firebase Auth — only public allowlist + format checks. */
export async function assertEmailAllowedBeforeAuth(email: string): Promise<void> {
  const emailLower = normalizeEmail(email);
  if (!emailLower) {
    throw new Error(AUTH_EMAIL_INVALID);
  }
  rejectInvalidOrDisposable(emailLower);
  if (skipAllowlistInDev()) return;
  if (!(await isEmailOnAuthAllowlist(emailLower))) {
    throw new Error(AUTH_EMAIL_NOT_AUTHORIZED);
  }
}

/** After sign-in — allowlist or existing Firestore profile for legacy accounts. */
export async function assertEmailAllowedForSignedInUser(user: User): Promise<void> {
  const emailLower = user.email ? normalizeEmail(user.email) : "";
  if (!emailLower) {
    throw new Error(AUTH_EMAIL_MISSING);
  }
  rejectInvalidOrDisposable(emailLower);
  if (skipAllowlistInDev()) return;
  if (await isEmailOnAuthAllowlist(emailLower)) return;
  const profileSnap = await getDoc(doc(getFirestoreDb(), USERS_COLLECTION, user.uid));
  if (profileSnap.exists()) return;
  throw new Error(AUTH_EMAIL_NOT_AUTHORIZED);
}
