/** Detect whether a Firestore workspace snapshot is a true remote change vs our own echo. */

export type RemoteWorkspaceNoticeInput = {
  nowMs?: number;
  /** Ignore snapshots until this time (set after local saves). */
  ignoreRemoteUntilMs: number;
  remoteUpdatedAtMs: number;
  lastLocalSaveMs: number;
  remoteDescriptionDraft: string;
  localDescription: string;
  remoteDesignJson: string;
  localDesignJson: string;
};

export function shouldShowRemoteWorkspaceNotice(
  input: RemoteWorkspaceNoticeInput,
): boolean {
  const now = input.nowMs ?? Date.now();
  if (now < input.ignoreRemoteUntilMs) return false;

  const descMatches =
    input.remoteDescriptionDraft.trim() === input.localDescription.trim();
  const designMatches = input.remoteDesignJson === input.localDesignJson;
  if (descMatches && designMatches) return false;

  if (!designMatches) return true;

  const withinOwnSaveWindow =
    input.remoteUpdatedAtMs > 0 &&
    input.remoteUpdatedAtMs <= input.lastLocalSaveMs + 5000;
  if (withinOwnSaveWindow && descMatches) return false;

  return !descMatches;
}

export function stableDesignJson(design: unknown): string {
  try {
    return JSON.stringify(design ?? null);
  } catch {
    return "null";
  }
}
