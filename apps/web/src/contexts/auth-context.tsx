"use client";

import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from "firebase/auth";
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getFirebaseAuth, getFirestoreDb } from "@/lib/firebase";
import {
  USERS_COLLECTION,
  type UserProfileDoc,
  type UserRole,
} from "@/lib/user-model";

type AuthState = {
  user: User | null;
  profile: UserProfileDoc | null;
  loading: boolean;
  error: string | null;
};

type AuthContextValue = AuthState & {
  signInEmail: (email: string, password: string) => Promise<void>;
  signUpEmail: (email: string, password: string, displayName: string, teamId: string, role: UserRole) => Promise<void>;
  signOutUser: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfileDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshProfile = useCallback(async () => {
    /* Profile is kept live via onSnapshot; no-op for API compatibility. */
  }, []);

  useEffect(() => {
    let cancelled = false;
    const auth = getFirebaseAuth();
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      if (cancelled) return;
      setUser(u);
      setError(null);
      if (!u) {
        setProfile(null);
        setLoading(false);
      } else {
        setLoading(true);
      }
    });
    return () => {
      cancelled = true;
      unsubAuth();
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const ref = doc(getFirestoreDb(), USERS_COLLECTION, user.uid);
    const unsubProfile = onSnapshot(
      ref,
      (snap) => {
        if (cancelled) return;
        setProfile(snap.exists() ? (snap.data() as UserProfileDoc) : null);
        setError(null);
        setLoading(false);
      },
      (e) => {
        if (cancelled) return;
        setProfile(null);
        setError(e instanceof Error ? e.message : "Failed to load profile");
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
      unsubProfile();
    };
  }, [user?.uid]);

  const signInEmail = useCallback(async (email: string, password: string) => {
    setError(null);
    const auth = getFirebaseAuth();
    await signInWithEmailAndPassword(auth, email.trim(), password);
  }, []);

  const signUpEmail = useCallback(
    async (email: string, password: string, displayName: string, teamId: string, role: UserRole) => {
      setError(null);
      const auth = getFirebaseAuth();
      const cred = await createUserWithEmailAndPassword(
        auth,
        email.trim(),
        password,
      );
      const uid = cred.user.uid;
      const ref = doc(getFirestoreDb(), USERS_COLLECTION, uid);
      const now = serverTimestamp();
      await setDoc(ref, {
        displayName: displayName.trim() || email.trim(),
        role,
        teamId: teamId.trim(),
        emailLower: email.trim().toLowerCase(),
        createdAt: now,
        updatedAt: now,
      });
    },
    [],
  );

  const signOutUser = useCallback(async () => {
    setError(null);
    await signOut(getFirebaseAuth());
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      profile,
      loading,
      error,
      signInEmail,
      signUpEmail,
      signOutUser,
      refreshProfile,
    }),
    [
      user,
      profile,
      loading,
      error,
      signInEmail,
      signUpEmail,
      signOutUser,
      refreshProfile,
    ],
  );

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
