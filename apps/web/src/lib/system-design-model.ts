import type { Timestamp } from "firebase/firestore";
import type { SystemDesignBlueprint } from "@/lib/system-design/types";

/**
 * Raw snapshot stored in Firestore (API or import). Normalize with `parseDesignJson` for UI.
 */
export type SystemDesignRawSnapshot = Record<string, unknown>;

export type SystemDesignVersion = {
  version: number;
  createdAt: Timestamp;
  snapshot: SystemDesignRawSnapshot;
  note?: string;
};

export type SystemDesignWorkspaceDoc = {
  ownerUid: string;
  descriptionDraft: string;
  latest: SystemDesignRawSnapshot | null;
  versions: SystemDesignVersion[];
  updatedAt: Timestamp;
  updatedAtIso?: string;
};

/** @deprecated Use SystemDesignBlueprint from @/lib/system-design/types — kept for gradual migration */
export type SystemDesignSnapshot = SystemDesignBlueprint;

export const SYSTEM_DESIGNS_COLLECTION = "systemDesigns";
export const SYSTEM_DESIGN_WORKSPACE_ID = "workspace";
