"use client";
import { FormEvent, useCallback, useEffect, useState } from "react";
type Nominee = {
  externalId: string;
  fullName: string;
  kind: string;
  relationship: string;
  status: string;
  isCurrent: boolean;
  documents: { externalId: string; originalFilename: string }[];
};
export function MemberNomineeManager() {
  const [nominees, setNominees] = useState<Nominee[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/member/nominees");
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Cannot load nominees");
      setNominees(body);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Cannot load nominees");
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const upload = async (id: string, file: File) => {
    const payload = new FormData();
    payload.set("evidence", file);
    const response = await fetch(`/api/member/nominees/${id}/documents`, {
      method: "POST",
      body: payload,
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Evidence upload failed");
    return result;
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    setBusy(true);
    try {
      const response = await fetch("/api/member/nominees", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: form.get("kind"),
          fullName: form.get("name"),
          relationship: form.get("relationship"),
          contactDetails: {
            ...(form.get("mobile") ? { mobile: form.get("mobile") } : {}),
            ...(form.get("email") ? { email: form.get("email") } : {}),
          },
          bankDetails: {
            accountHolderName: form.get("holder"),
            accountNumber: form.get("account"),
            ifsc: form.get("ifsc"),
          },
          ...(form.get("identificationReference")
            ? {
                identification: {
                  documentType: form.get("identificationType"),
                  reference: form.get("identificationReference"),
                },
              }
            : {}),
          ...(form.get("replacement")
            ? { replacesNomineeExternalId: form.get("replacement") }
            : {}),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Nominee could not be saved");
      const file = form.get("evidence");
      element.reset();
      if (file instanceof File && file.size) {
        try {
          await upload(body.externalId, file);
          setMessage("Nominee and evidence submitted for verification.");
        } catch {
          setMessage(
            "Nominee saved. The evidence upload failed; attach the document to the pending nominee below.",
          );
        }
      } else setMessage("Nominee saved. Add supporting evidence below before verification.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not submit nominee");
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <p>
        Keep exactly one verified Primary Nominee and at least one verified Secondary/Backup
        Nominee. Replacements remain pending until verified; previous verified nominees remain
        valid.
      </p>
      <p role="status">{message}</p>
      {nominees.map((nominee) => (
        <article key={nominee.externalId}>
          <h2>{nominee.fullName}</h2>
          <p>
            {nominee.kind} · {nominee.relationship} · {nominee.status} ·{" "}
            {nominee.isCurrent ? "Current" : "Pending / historical"}
          </p>
          {nominee.documents.map((document) => (
            <p key={document.externalId}>
              <a
                href={`/api/member/nominees/${nominee.externalId}/documents/${document.externalId}/download`}
              >
                {document.originalFilename}
              </a>
            </p>
          ))}
          {nominee.status === "PENDING_VERIFICATION" && (
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                const file = form.get("evidence");
                if (!(file instanceof File)) return;
                setBusy(true);
                try {
                  await upload(nominee.externalId, file);
                  setMessage("Nominee evidence uploaded.");
                  await load();
                } catch (error) {
                  setMessage(error instanceof Error ? error.message : "Upload failed");
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label>
                Supporting evidence (PDF / PNG / JPEG, up to 5 MB)
                <input
                  type="file"
                  name="evidence"
                  accept="application/pdf,image/png,image/jpeg"
                  required
                />
              </label>
              <button disabled={busy}>Attach evidence</button>
            </form>
          )}
        </article>
      ))}
      <article>
        <h2>Submit nominee / replacement</h2>
        <form onSubmit={submit}>
          <fieldset disabled={busy}>
            <label>
              Nominee kind
              <select name="kind">
                <option>PRIMARY</option>
                <option>SECONDARY</option>
              </select>
            </label>
            <label>
              Replace an existing verified nominee (optional)
              <select name="replacement">
                <option value="">New nominee</option>
                {nominees
                  .filter((nominee) => nominee.isCurrent && nominee.status === "VERIFIED")
                  .map((nominee) => (
                    <option key={nominee.externalId} value={nominee.externalId}>
                      {nominee.kind}: {nominee.fullName}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Full name
              <input name="name" minLength={2} maxLength={160} required />
            </label>
            <label>
              Relationship
              <input name="relationship" minLength={2} maxLength={80} required />
            </label>
            <label>
              Mobile (with country code)
              <input name="mobile" type="tel" placeholder="+91…" />
            </label>
            <label>
              Email
              <input name="email" type="email" maxLength={254} />
            </label>
            <label>
              Bank account holder
              <input name="holder" minLength={2} maxLength={160} autoComplete="off" required />
            </label>
            <label>
              Bank account number
              <input
                name="account"
                inputMode="numeric"
                minLength={6}
                maxLength={24}
                autoComplete="off"
                required
              />
            </label>
            <label>
              IFSC
              <input name="ifsc" minLength={11} maxLength={11} autoComplete="off" required />
            </label>
            <label>
              Identification type (optional)
              <input name="identificationType" maxLength={80} />
            </label>
            <label>
              Identification reference (optional)
              <input name="identificationReference" maxLength={100} autoComplete="off" />
            </label>
            <label>
              Supporting evidence
              <input type="file" name="evidence" accept="application/pdf,image/png,image/jpeg" />
            </label>
            <button>{busy ? "Saving…" : "Submit for verification"}</button>
          </fieldset>
        </form>
      </article>
    </>
  );
}
