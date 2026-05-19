import { browserLocalPersistence, setPersistence, type Auth } from "firebase/auth";

let persistenceReady: Promise<void> | null = null;

/** Must complete before sign-in or reading session on a fresh page load (e.g. /chat). */
export function ensureAuthPersistence(auth: Auth): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.resolve();
  }
  if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === "true") {
    return Promise.resolve();
  }
  if (!persistenceReady) {
    persistenceReady = setPersistence(auth, browserLocalPersistence).then(() => undefined);
  }
  return persistenceReady;
}
