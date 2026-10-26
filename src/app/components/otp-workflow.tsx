"use client";
import { FormEvent, useState } from "react";
import { VerificationResponseError, verificationFailureMessage } from "./verification-feedback";
type Purpose =
  "LOGIN" | "PASSWORD_RESET" | "VERIFY_EMAIL" | "VERIFY_MOBILE" | "CHANGE_EMAIL" | "CHANGE_MOBILE";
export function OtpWorkflow({ member = false }: { member?: boolean }) {
  const [purpose, setPurpose] = useState<Purpose>(member ? "VERIFY_EMAIL" : "LOGIN");
  const [channel, setChannel] = useState("EMAIL");
  const [challenge, setChallenge] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const requestCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setChallenge("");
    try {
      const response = await fetch("/api/auth/otp/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          purpose,
          channel: purpose.endsWith("EMAIL")
            ? "EMAIL"
            : purpose.endsWith("MOBILE")
              ? "SMS"
              : channel,
          ...(form.get("destination") ? { destination: form.get("destination") } : {}),
          ...(form.get("currentPassword") ? { currentPassword: form.get("currentPassword") } : {}),
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new VerificationResponseError(result.error ?? "Verification request failed");
      setChallenge(result.challengeExternalId);
      setMessage(
        "If these contact details match an eligible account, a verification code has been sent. It expires in 10 minutes.",
      );
    } catch (error) {
      setMessage(verificationFailureMessage(error, "request"));
    } finally {
      setBusy(false);
    }
  };
  const verify = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      const response = await fetch("/api/auth/otp/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          purpose,
          challengeExternalId: challenge,
          code: form.get("code"),
          ...(purpose === "PASSWORD_RESET" ? { newPassword: form.get("newPassword") } : {}),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new VerificationResponseError(result.error ?? "Verification failed");
      setChallenge("");
      setMessage("Verification completed.");
      if (purpose === "LOGIN") window.location.assign(result.redirectTo ?? "/member");
      else if (result.signInRequired) window.location.assign("/login");
      else window.location.reload();
    } catch (error) {
      setMessage(verificationFailureMessage(error, "verify"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <article>
      <h2>
        {member ? "Contact verification and changes" : "Sign in with a code / reset password"}
      </h2>
      <p role="status">{message}</p>
      <form onSubmit={requestCode}>
        <fieldset disabled={busy}>
          <label>
            Action
            <select
              value={purpose}
              onChange={(event) => {
                setPurpose(event.target.value as Purpose);
                setChallenge("");
              }}
            >
              {member ? (
                <>
                  <option value="VERIFY_EMAIL">Verify my email</option>
                  <option value="VERIFY_MOBILE">Verify my mobile</option>
                  <option value="CHANGE_EMAIL">Change email</option>
                  <option value="CHANGE_MOBILE">Change mobile</option>
                </>
              ) : (
                <>
                  <option value="LOGIN">Sign in with a code</option>
                  <option value="PASSWORD_RESET">Reset password</option>
                </>
              )}
            </select>
          </label>
          {!member && (
            <label>
              Send code by
              <select value={channel} onChange={(event) => setChannel(event.target.value)}>
                <option value="EMAIL">Email</option>
                <option value="SMS">SMS</option>
              </select>
            </label>
          )}
          {(!member || purpose.startsWith("CHANGE_")) && (
            <label>
              {purpose.endsWith("EMAIL") || (!member && channel === "EMAIL")
                ? "Email address"
                : "Mobile with country code"}
              <input name="destination" required maxLength={254} autoComplete="off" />
            </label>
          )}
          {purpose.startsWith("CHANGE_") && (
            <label>
              Current password
              <input
                name="currentPassword"
                type="password"
                autoComplete="current-password"
                maxLength={128}
                required
              />
            </label>
          )}
          <button>Send verification code</button>
        </fieldset>
      </form>
      {challenge && (
        <form onSubmit={verify}>
          <fieldset disabled={busy}>
            <label>
              Six-digit code
              <input
                name="code"
                inputMode="numeric"
                pattern="[0-9]{6}"
                autoComplete="one-time-code"
                required
              />
            </label>
            {purpose === "PASSWORD_RESET" && (
              <label>
                New password
                <input
                  name="newPassword"
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={128}
                  required
                />
              </label>
            )}
            <button>Verify code</button>
          </fieldset>
        </form>
      )}
    </article>
  );
}
