"use client";
import Link from "next/link";
import { FormEvent, useState } from "react";

export default function RegisterPage() {
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
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
  }
  return (
    <main>
      <p className="eyebrow">MEMBER REGISTRATION</p>
      <h1>Join the Community Support Foundation</h1>
      <form onSubmit={submit}>
        <label>
          Full name
          <input name="fullName" required minLength={2} />
        </label>
        <label>
          Email
          <input name="email" type="email" required />
        </label>
        <label>
          Mobile
          <input name="mobile" placeholder="+919876543210" required />
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
          <input name="password" type="password" required minLength={12} />
        </label>
        <button type="submit">Create member account</button>
        <p role="status">{message}</p>
      </form>
      <Link href="/login">Already registered? Sign in</Link>
    </main>
  );
}
