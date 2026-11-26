"use client";

import Image from "next/image";
import Link from "next/link";
import { type FormEvent, useRef, useState } from "react";

const photoEndpoint = "/api/member/profile/photo";

export function ProfilePhoto({
  fullName,
  photoUpdatedAt,
  onPhotoChanged,
  canViewIdCard = false,
}: {
  fullName: string;
  photoUpdatedAt: string | null;
  onPhotoChanged: (updatedAt: string | null) => void;
  canViewIdCard?: boolean;
}) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState(false);
  const pending = useRef(false);
  const input = useRef<HTMLInputElement>(null);

  async function update(method: "POST" | "DELETE", file?: File) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(photoEndpoint, {
        method,
        ...(file ? { body: file, headers: { "Content-Type": file.type } } : {}),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Photo could not be saved.");
      onPhotoChanged(data.photoUpdatedAt);
      if (input.current) input.current.value = "";
      setSelected(false);
      setMessage(method === "POST" ? "Profile photo saved." : "Profile photo removed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Photo could not be saved.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = input.current?.files?.[0];
    if (file) void update("POST", file);
  }

  return (
    <section className="profile-photo-panel" aria-labelledby="profile-photo-heading">
      <div className="profile-photo-preview">
        {photoUpdatedAt ? (
          <Image
            src={`${photoEndpoint}?v=${encodeURIComponent(photoUpdatedAt)}`}
            alt={`${fullName}'s profile photo`}
            width={80}
            height={80}
            unoptimized
          />
        ) : (
          <span aria-hidden="true">
            {fullName
              .trim()
              .split(/\s+/)
              .slice(0, 2)
              .map((name) => Array.from(name)[0])
              .join("")
              .toUpperCase()}
          </span>
        )}
      </div>
      <div>
        <h2 id="profile-photo-heading">Profile photo</h2>
        <p>
          {photoUpdatedAt
            ? "Use this photo on your member ID card."
            : "Add a clear photo of yourself to create your member ID card."}
        </p>
        {photoUpdatedAt && canViewIdCard && <Link href="/member/id-card">View my ID card →</Link>}
        <form onSubmit={submit} className="profile-photo-form">
          <label htmlFor="member-photo-file">Choose a photo</label>
          <input
            id="member-photo-file"
            ref={input}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            aria-describedby="member-photo-formats"
            disabled={busy}
            onChange={(event) => setSelected(!!event.target.files?.length)}
          />
          <small id="member-photo-formats">JPEG, PNG or WebP · up to 3 MB</small>
          <div className="due-actions">
            <button type="submit" disabled={busy || !selected}>
              {photoUpdatedAt ? "Replace photo" : "Upload photo"}
            </button>
            {photoUpdatedAt && (
              <button
                className="due-wallet-action"
                type="button"
                disabled={busy}
                onClick={() => void update("DELETE")}
              >
                Remove photo
              </button>
            )}
          </div>
        </form>
        {message && <p role="status">{message}</p>}
      </div>
    </section>
  );
}
