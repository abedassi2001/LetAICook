import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAnalytics, type Analytics } from "firebase/analytics";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import {
  connectFirestoreEmulator,
  getFirestore,
  type Firestore,
} from "firebase/firestore";

function readConfig() {
  return {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    measurementId:
      process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || undefined,
  };
}

let emulatorFirestoreConnected = false;
let emulatorAuthConnected = false;
let analyticsSingleton: Analytics | null | undefined;

/** Call once from the client (e.g. root layout) when `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` is set. */
export function initFirebaseAnalytics(): void {
  if (typeof window === "undefined") return;
  if (!process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID) return;
  if (analyticsSingleton !== undefined) return;
  try {
    analyticsSingleton = getAnalytics(getFirebaseApp());
  } catch {
    analyticsSingleton = null;
  }
}

export function getFirebaseApp(): FirebaseApp {
  const existing = getApps()[0];
  if (existing) return existing;
  const config = readConfig();
  if (!config.apiKey || !config.projectId) {
    throw new Error(
      "Missing Firebase web config. Copy apps/web/firebase.web.env.sample to .env.local and fill values.",
    );
  }
  return initializeApp(config);
}

export function getFirestoreDb(): Firestore {
  const db = getFirestore(getFirebaseApp());
  if (
    typeof window !== "undefined" &&
    process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === "true" &&
    !emulatorFirestoreConnected
  ) {
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
    emulatorFirestoreConnected = true;
  }
  return db;
}

export function getFirebaseAuth(): Auth {
  const auth = getAuth(getFirebaseApp());
  if (
    typeof window !== "undefined" &&
    process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === "true" &&
    !emulatorAuthConnected
  ) {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    emulatorAuthConnected = true;
  }
  return auth;
}
