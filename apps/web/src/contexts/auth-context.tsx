"use client";

import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  getRedirectResult,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from "firebase/auth";
import { formatAuthError, shouldUseGoogleRedirect } from "@/lib/auth-errors";
import { doc, getDoc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { ensureAuthPersistence, getFirebaseAuth, getFirestoreDb } from "@/lib/firebase";
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
  signInGoogle: () => Promise<void>;
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

  const ensureProfileForUser = useCallback(async (u: User) => {
    const ref = doc(getFirestoreDb(), USERS_COLLECTION, u.uid);
    const snap = await getDoc(ref);
    if (snap.exists()) return;
    const now = serverTimestamp();
    const email = u.email?.trim().toLowerCase() ?? "";
    await setDoc(ref, {
      displayName: u.displayName?.trim() || email || "User",
      role: "worker" satisfies UserRole,
      teamId: "",
      emailLower: email,
      createdAt: now,
      updatedAt: now,
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    let unsubAuth = () => {};

    void (async () => {
      let auth;
      try {
        auth = getFirebaseAuth();
      } catch (e) {
        if (!cancelled) {
          setError(formatAuthError(e));
          setLoading(false);
        }
        return;
      }

      await ensureAuthPersistence(auth);
      if (cancelled) return;

      try {
        const result = await getRedirectResult(auth);
        if (!cancelled && result?.user) {
          await ensureProfileForUser(result.user);
        }
      } catch (e) {
        if (!cancelled) {
          setError(formatAuthError(e));
        }
      }

      if (cancelled) return;

      unsubAuth = onAuthStateChanged(auth, (u) => {
        if (cancelled) return;
        setUser(u);
        if (!u) {
          setProfile(null);
        } else {
          void ensureProfileForUser(u).catch((e) => {
            setError(formatAuthError(e));
          });
        }
        setLoading(false);
      });
    })();

    return () => {
      cancelled = true;
      unsubAuth();
    };
  }, [ensureProfileForUser]);

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
      },
      (e) => {
        if (cancelled) return;
        setProfile(null);
        setError(e instanceof Error ? e.message : "Failed to load profile");
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
    await ensureAuthPersistence(auth);
    const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
    setUser(cred.user);
    setLoading(false);
    await ensureProfileForUser(cred.user);
  }, [ensureProfileForUser]);

  const signInGoogle = useCallback(async () => {
    setError(null);
    const auth = getFirebaseAuth();
    await ensureAuthPersistence(auth);
    const provider = new GoogleAuthProvider();
    if (shouldUseGoogleRedirect()) {
      await signInWithRedirect(auth, provider);
      return;
    }
    const cred = await signInWithPopup(auth, provider);
    setUser(cred.user);
    setLoading(false);
    await ensureProfileForUser(cred.user);
  }, [ensureProfileForUser]);

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
      signInGoogle,
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
      signInGoogle,
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
