import "server-only";

import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

/**
 * firebase-admin singleton. Credentials come from Application Default
 * Credentials (App Hosting in prod, `gcloud auth application-default login`
 * or the emulators locally) — never from a service-account key file.
 */
const app =
  getApps()[0] ??
  initializeApp({
    projectId:
      process.env.GOOGLE_CLOUD_PROJECT ??
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  });

export const adminAuth = getAuth(app);

export function getDb(): Firestore {
  const firestore = getFirestore(app);
  try {
    firestore.settings({ ignoreUndefinedProperties: true });
  } catch {
    // settings() may only run once per instance; in dev, HMR re-evaluates
    // this module while the instance (which already has it applied) survives.
  }
  return firestore;
}
