"use client";
import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const result = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
    });
    if (!result.ok) {
      setError((await result.json()).error ?? "Could not sign in");
      return;
    }
    router.push("/member");
    router.refresh();
  }
  return (
    <main>
      <p className="eyebrow">SECURE ACCESS</p>
      <h1>Sign in</h1>
      <form onSubmit={submit}>
        <label>
          Email
          <input name="email" type="email" required />
        </label>
        <label>
          Password
          <input name="password" type="password" required />
        </label>
        <button type="submit">Sign in</button>
        {error && <p role="alert">{error}</p>}
      </form>
      <Link href="/register">Create a member account</Link>
    </main>
  );
}
