"use client";

import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
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

async function fetchProfile(uid: string): Promise<UserProfileDoc | null> {
  const ref = doc(getFirestoreDb(), USERS_COLLECTION, uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return snap.data() as UserProfileDoc;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfileDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshProfile = useCallback(async () => {
    const auth = getFirebaseAuth();
    const u = auth.currentUser;
    if (!u) {
      setProfile(null);
      return;
    }
    const p = await fetchProfile(u.uid);
    setProfile(p);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const auth = getFirebaseAuth();
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (cancelled) return;
      setUser(u);
      setError(null);
      if (!u) {
        setProfile(null);
        setLoading(false);
        return;
      }
      try {
        const p = await fetchProfile(u.uid);
        if (cancelled) return;
        setProfile(p);
      } catch (e) {
        if (!cancelled) {
          setProfile(null);
          setError(e instanceof Error ? e.message : "Failed to load profile");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

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
