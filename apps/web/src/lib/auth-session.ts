import type { User } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase";

/** React context user or Firebase SDK session (avoids redirect race after popup sign-in). */
export function resolveSignedInUser(contextUser: User | null): User | null {
  return contextUser ?? (typeof window !== "undefined" ? getFirebaseAuth().currentUser : null);
}
