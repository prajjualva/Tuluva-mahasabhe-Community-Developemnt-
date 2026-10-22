"use client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

export function SignOutButton() {
  const router = useRouter();
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <>
      <button
        disabled={busy}
        onClick={async () => {
          if (lock.current) return;
          lock.current = true;
          setBusy(true);
          setError("");
          try {
            const response = await fetch("/api/auth/logout", { method: "POST" });
            if (!response.ok) throw new Error("Sign out failed");
            router.replace("/login");
            router.refresh();
          } catch {
            setError("Could not sign out. Your session may still be active. Please try again.");
          } finally {
            lock.current = false;
            setBusy(false);
          }
        }}
      >
        {busy ? "Signing out…" : "Sign out"}
      </button>
      {error && <p role="alert">{error}</p>}
    </>
  );
}
