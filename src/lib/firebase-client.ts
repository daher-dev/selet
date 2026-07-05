"use client";

import { getApps, initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";

/**
 * Firebase client SDK — used ONLY on /login for the Google sign-in popup.
 * After the ID token is exchanged for a session cookie, the client SDK is
 * signed out; it holds no state anywhere else in the app.
 */
export function getClientAuth(): Auth {
  const app =
    getApps()[0] ??
    initializeApp({
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    });
  const auth = getAuth(app);
  const emulatorHost = process.env.NEXT_PUBLIC_AUTH_EMULATOR_HOST;
  if (emulatorHost && !("emulatorConfig" in auth && auth.emulatorConfig)) {
    connectAuthEmulator(auth, `http://${emulatorHost}`, {
      disableWarnings: true,
    });
  }
  return auth;
}
