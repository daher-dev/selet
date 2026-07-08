import "server-only";

import { Timestamp } from "firebase-admin/firestore";
import { getDb } from "@/lib/firebase-admin";
import type { ActivityEntry, Section } from "@/lib/types";

/**
 * Team activity feed. Meaningful events emitted by the server actions after a
 * mutation succeeds land in a per-store `stores/{storeId}/activities`
 * subcollection, ordered by `at` desc and optionally filtered by the acting
 * user's email (indexed — see firestore.indexes.json). The member sheet renders
 * a person's recent timeline from `listActivity(storeId, { byEmail })`.
 */

function activitiesCol(storeId: string) {
  return getDb().collection("stores").doc(storeId).collection("activities");
}

export interface ActivityInput {
  /** lucide icon name (kebab-case), matching the design metaphors. */
  icon: string;
  label: string;
  detail: string;
  /** Acting user email. */
  by: string;
  section: Section;
}

/**
 * Records one activity event. Best-effort by design: a logging failure must
 * never break the user action that triggered it, so errors are swallowed (the
 * mutation has already committed by the time this runs).
 */
export async function logActivity(
  storeId: string,
  entry: ActivityInput,
): Promise<void> {
  try {
    await activitiesCol(storeId).add({
      icon: entry.icon,
      label: entry.label,
      detail: entry.detail,
      by: entry.by.toLowerCase(),
      section: entry.section,
      at: Timestamp.now(),
    });
  } catch (err) {
    console.warn("logActivity failed", err);
  }
}

function toEntry(id: string, d: FirebaseFirestore.DocumentData): ActivityEntry {
  return {
    id,
    icon: d.icon ?? "activity",
    label: d.label ?? "",
    detail: d.detail ?? "",
    by: d.by ?? "",
    at: d.at?.toDate().toISOString() ?? "",
    section: d.section ?? undefined,
  };
}

export async function listActivity(
  storeId: string,
  opts: { byEmail?: string; limit?: number } = {},
): Promise<ActivityEntry[]> {
  let q = activitiesCol(storeId).orderBy("at", "desc");
  if (opts.byEmail) q = q.where("by", "==", opts.byEmail.toLowerCase());
  q = q.limit(opts.limit ?? 20);
  const snap = await q.get();
  return snap.docs.map((doc) => toEntry(doc.id, doc.data()));
}
