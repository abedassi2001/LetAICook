import { ensureAuthAllowlistEntry } from "@/lib/auth-allowlist";
import {
  isValidEmailFormat,
  memberDocIdFromEmail,
  normalizeEmail,
} from "@/lib/email-utils";
import { getFirestoreDb } from "@/lib/firebase";
import {
  PROJECT_MEMBERS_COLLECTION,
  type ProjectMemberDoc,
} from "@/lib/project-member-model";
import { USERS_COLLECTION } from "@/lib/user-model";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";

export function normalizeMemberEmail(email: string): string {
  return normalizeEmail(email);
}

export function isValidMemberEmail(email: string): boolean {
  return isValidEmailFormat(email);
}

export { memberDocIdFromEmail };

export function projectMembersCollection(projectKey: string) {
  return collection(
    getFirestoreDb(),
    "projects",
    projectKey,
    PROJECT_MEMBERS_COLLECTION,
  );
}

export async function findUserUidByEmail(emailLower: string): Promise<{
  uid: string;
  displayName: string;
} | null> {
  const q = query(
    collection(getFirestoreDb(), USERS_COLLECTION),
    where("emailLower", "==", emailLower),
    limit(1),
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  const data = d.data();
  return {
    uid: d.id,
    displayName:
      (typeof data.displayName === "string" && data.displayName) || emailLower,
  };
}

export async function addProjectMemberByEmail(
  projectKey: string,
  email: string,
  addedByUid: string,
  displayNameHint?: string,
): Promise<{ memberId: string; linked: boolean }> {
  const emailLower = normalizeMemberEmail(email);
  if (!isValidMemberEmail(emailLower)) {
    throw new Error("Enter a valid email address.");
  }

  const memberId = memberDocIdFromEmail(emailLower);
  const ref = doc(projectMembersCollection(projectKey), memberId);

  const linked = await findUserUidByEmail(emailLower);
  const now = serverTimestamp();
  const displayName =
    displayNameHint?.trim() ||
    linked?.displayName ||
    emailLower.split("@")[0] ||
    emailLower;

  await setDoc(ref, {
    emailLower,
    displayName,
    uid: linked?.uid ?? null,
    addedByUid,
    addedAt: now,
    updatedAt: now,
  });

  await ensureAuthAllowlistEntry(emailLower, "project_member");

  return { memberId, linked: Boolean(linked) };
}

export async function removeProjectMember(
  projectKey: string,
  memberId: string,
): Promise<void> {
  await deleteDoc(doc(projectMembersCollection(projectKey), memberId));
}

export async function refreshProjectMemberLink(
  projectKey: string,
  memberId: string,
  emailLower: string,
): Promise<void> {
  const linked = await findUserUidByEmail(emailLower);
  if (!linked) return;
  await updateDoc(doc(projectMembersCollection(projectKey), memberId), {
    uid: linked.uid,
    displayName: linked.displayName,
    updatedAt: serverTimestamp(),
  });
}

export function subscribeProjectMembers(
  projectKey: string,
  onData: (items: { id: string; data: ProjectMemberDoc }[]) => void,
  onError: (message: string) => void,
): () => void {
  return onSnapshot(
    projectMembersCollection(projectKey),
    (snap) => {
      const items = snap.docs.map((d) => ({
        id: d.id,
        data: d.data() as ProjectMemberDoc,
      }));
      items.sort((a, b) =>
        a.data.displayName.localeCompare(b.data.displayName, undefined, {
          sensitivity: "base",
        }),
      );
      onData(items);
    },
    (err) => onError(err.message),
  );
}
