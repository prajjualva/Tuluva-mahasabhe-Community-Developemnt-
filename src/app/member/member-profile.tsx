"use client";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
type Profile = {
  externalId: string;
  fullName: string;
  address: string;
  status: string;
  user: {
    email: string;
    mobile: string;
    emailVerifiedAt: string | null;
    mobileVerifiedAt: string | null;
  };
  coordinator: { member: { fullName: string }; referralCode: string } | null;
  nominees: { kind: string; fullName: string; status: string }[];
};
type Coordinator = { externalId: string; member: { fullName: string }; referralCode: string };
export function MemberProfile({
  summary = false,
  coordinatorOnly = false,
}: {
  summary?: boolean;
  coordinatorOnly?: boolean;
}) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [choices, setChoices] = useState<Coordinator[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/member/profile");
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Profile unavailable");
      setProfile(body);
      if (coordinatorOnly) {
        const result = await fetch("/api/member/coordinator");
        if (result.ok) setChoices(await result.json());
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Profile unavailable");
    }
  }, [coordinatorOnly]);
  useEffect(() => {
    void load();
  }, [load]);
  const save = async (event: FormEvent<HTMLFormElement>, coordinator: boolean) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      const response = await fetch(
        coordinator ? "/api/member/coordinator" : "/api/member/profile",
        {
          method: coordinator ? "POST" : "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(
            coordinator
              ? { coordinatorExternalId: form.get("coordinator"), reason: form.get("reason") }
              : { fullName: form.get("fullName"), address: form.get("address") },
          ),
        },
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Change denied");
      setMessage(
        coordinator
          ? "Coordinator changed. Both Coordinators were notified and assignment history was preserved."
          : "Profile updated.",
      );
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Update failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <article>
      <h2>
        {summary
          ? (profile?.fullName ?? "My membership")
          : coordinatorOnly
            ? "My Coordinator"
            : "My profile"}
      </h2>
      <p role="status">{message}</p>
      {profile ? (
        <>
          <p>
            Member reference: {profile.externalId} · {profile.status}
          </p>
          <p>
            Coordinator: {profile.coordinator?.member.fullName ?? "Foundation Admin"}
            {profile.coordinator ? ` · ${profile.coordinator.referralCode}` : ""}
          </p>
          {summary ? (
            <>
              <p>Verified current nominees: {profile.nominees.length}</p>
              <Link href="/member/profile">My profile and verification</Link> ·{" "}
              <Link href="/member/nominee">Manage nominees</Link>
            </>
          ) : coordinatorOnly ? (
            <form onSubmit={(event) => void save(event, true)}>
              <label>
                Choose an active Coordinator
                <select name="coordinator" required>
                  <option value="">Select Coordinator</option>
                  {choices.map((choice) => (
                    <option key={choice.externalId} value={choice.externalId}>
                      {choice.member.fullName} · {choice.referralCode}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Reason for change
                <textarea name="reason" minLength={3} maxLength={1000} required />
              </label>
              <button disabled={busy}>Change Coordinator</button>
            </form>
          ) : (
            <>
              <p>
                Email: {profile.user.email} ·{" "}
                {profile.user.emailVerifiedAt ? "Verified" : "Verification pending"}
              </p>
              <p>
                Mobile: {profile.user.mobile} ·{" "}
                {profile.user.mobileVerifiedAt ? "Verified" : "Verification pending"}
              </p>
              <form onSubmit={(event) => void save(event, false)}>
                <label>
                  Full name
                  <input
                    key={profile.fullName}
                    name="fullName"
                    defaultValue={profile.fullName}
                    minLength={2}
                    maxLength={160}
                    required
                  />
                </label>
                <label>
                  Address
                  <textarea
                    key={profile.address}
                    name="address"
                    defaultValue={profile.address}
                    minLength={5}
                    maxLength={1000}
                    required
                  />
                </label>
                <button disabled={busy}>Save profile</button>
              </form>
            </>
          )}
        </>
      ) : (
        !message && <p>Loading profile…</p>
      )}
    </article>
  );
}
