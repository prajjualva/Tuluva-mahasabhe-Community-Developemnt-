"use client";
import Link from "next/link";
import { FormEvent, useState } from "react";
import { AuthShell } from "../components/auth-shell";

export default function RegisterPage() {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(Object.fromEntries(form)),
      });
      const data = await response.json();
      setMessage(
        response.ok
          ? "Registration created. Sign in to pay your first membership due."
          : (data.error ?? "Registration failed"),
      );
    } catch {
      setMessage(
        "Could not connect. Please try again; if you already registered, sign in instead.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthShell registration>
      <p className="eyebrow">MEMBER REGISTRATION</p>
      <h1>Become a member</h1>
      <p className="page-description">
        Join through your Coordinator and manage your community membership online.
      </p>
      <form className="auth-form" onSubmit={submit}>
        <label>
          Full name
          <input name="fullName" required minLength={2} />
        </label>
        <label>
          Email
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <label>
          Mobile
          <input name="mobile" type="tel" autoComplete="tel" placeholder="+919876543210" required />
        </label>
        <label>
          Referral code
          <input name="referralCode" required />
        </label>
        <label>
          Address
          <textarea name="address" required minLength={5} />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
          />
        </label>
        <small>
          Use at least 12 characters for your password. Registration creates your first ₹369
          membership due; it does not collect a payment automatically.
        </small>
        <button type="submit" disabled={busy}>
          {busy ? "Creating your account…" : "Create member account"}
        </button>
        <p role="status">{message}</p>
      </form>
      <Link href="/login">Already registered? Sign in</Link>
    </AuthShell>
  );
}
