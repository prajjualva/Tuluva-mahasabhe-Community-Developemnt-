"use client";
import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { safeInternalRedirect } from "../../server/security/request-policy";
import { OtpWorkflow } from "../components/otp-workflow";
import { AuthShell } from "../components/auth-shell";

export default function LoginForm({ emailOnly }: { emailOnly: boolean }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const result = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
      });
      if (!result.ok) {
        setError((await result.json()).error ?? "Could not sign in");
        return;
      }
      const data = await result.json();
      const next = new URLSearchParams(window.location.search).get("next");
      router.push(
        data.redirectTo === "/account-unavailable"
          ? data.redirectTo
          : safeInternalRedirect(next, data.redirectTo ?? "/member"),
      );
      router.refresh();
    } catch {
      setError("Could not connect. Please try signing in again.");
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <AuthShell>
      <p className="eyebrow">SECURE ACCESS</p>
      <h1>Sign in</h1>
      <p className="page-description">Welcome back. Enter your account details to continue.</p>
      <form className="auth-form" onSubmit={submit}>
        <label>
          Email
          <input
            name="email"
            type="email"
            autoComplete="username"
            required
            placeholder="you@example.com"
          />
        </label>
        <label>
          Password
          <input name="password" type="password" autoComplete="current-password" required />
        </label>
        <button type="submit" disabled={submitting}>
          {submitting ? "Signing in…" : "Sign in"}
        </button>
        {error && <p role="alert">{error}</p>}
      </form>
      <Link href="/register">Create a member account</Link>
      <details>
        <summary>Use a verification code or reset your password</summary>
        <OtpWorkflow emailOnly={emailOnly} />
      </details>
    </AuthShell>
  );
}
