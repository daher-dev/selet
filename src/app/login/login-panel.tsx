"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { Loader2 } from "lucide-react";
import { getClientAuth } from "@/lib/firebase-client";

export function LoginPanel() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setPending(true);
    setError(null);
    const auth = getClientAuth();
    try {
      const credential = await signInWithPopup(auth, new GoogleAuthProvider());
      const idToken = await credential.user.getIdToken();

      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });
      const body = (await res.json()) as {
        redirectTo?: string;
        error?: string;
      };
      if (!res.ok) {
        setError(body.error ?? "Não foi possível entrar. Tente novamente.");
        return;
      }
      router.replace(body.redirectTo ?? "/");
      router.refresh();
    } catch (err) {
      if (
        err instanceof Error &&
        "code" in err &&
        (err as { code: string }).code === "auth/popup-closed-by-user"
      ) {
        return; // user dismissed the popup — not an error
      }
      setError("Não foi possível entrar. Tente novamente.");
    } finally {
      setPending(false);
      // The session cookie is the only credential from here on.
      await signOut(getClientAuth()).catch(() => {});
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={signIn}
        disabled={pending}
        className="flex w-full items-center justify-center gap-3 rounded-[13px] border-[1.5px] border-input bg-white px-4 py-3.5 text-[15px] font-semibold text-ink transition-all duration-150 hover:-translate-y-px hover:border-primary hover:shadow-[0_10px_24px_-14px_rgba(24,107,65,.5)] active:translate-y-0 disabled:pointer-events-none disabled:opacity-60"
      >
        {pending ? (
          <Loader2 className="size-[19px] animate-spin text-primary" />
        ) : (
          <GoogleIcon />
        )}
        <span>Entrar com Google</span>
      </button>
      {error && (
        <p
          role="alert"
          className="mt-3 rounded-xl bg-danger-wash px-3.5 py-2.5 text-[12.5px] leading-normal text-destructive"
        >
          {error}
        </p>
      )}
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z"
      />
    </svg>
  );
}
