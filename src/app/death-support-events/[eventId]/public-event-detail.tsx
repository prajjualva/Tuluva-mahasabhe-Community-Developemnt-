"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import type { PublicDeathSupportEvent } from "../published-event-list";

type Condolence = {
  externalId: string;
  authorName: string;
  body: string;
  createdAt: string;
};

function formatDate(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Date not available" : parsed.toLocaleDateString();
}

/**
 * Public event detail never infers or prints restricted fields. The API is the
 * boundary that decides whether an event is published and which comments are
 * visible; the UI only receives those allowlisted DTOs.
 */
export function PublicEventDetail({ eventId }: { eventId: string }) {
  const [event, setEvent] = useState<PublicDeathSupportEvent | null>(null);
  const [comments, setComments] = useState<Condolence[]>([]);
  const [message, setMessage] = useState("Loading event…");
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [commentSignInRequired, setCommentSignInRequired] = useState(false);

  const load = async () => {
    try {
      const [eventResponse, commentsResponse] = await Promise.all([
        fetch(`/api/death-events/${encodeURIComponent(eventId)}`),
        fetch(`/api/death-events/${encodeURIComponent(eventId)}/comments`),
      ]);
      const eventData = (await eventResponse.json()) as {
        event?: PublicDeathSupportEvent;
        error?: string;
      };
      const commentsData = (await commentsResponse.json()) as {
        comments?: Condolence[];
        error?: string;
      };
      if (!eventResponse.ok) {
        setEvent(null);
        setMessage(eventData.error ?? "This published event is unavailable.");
        return;
      }
      setEvent(eventData.event ?? null);
      setComments(commentsResponse.ok ? (commentsData.comments ?? []) : []);
      setMessage("");
    } catch {
      setMessage("This published event is temporarily unavailable.");
    }
  };

  useEffect(() => {
    void load();
  }, [eventId]);

  const postCondolence = async (formEvent: FormEvent<HTMLFormElement>) => {
    formEvent.preventDefault();
    const body = comment.trim();
    if (!body) return;
    setSubmitting(true);
    setCommentSignInRequired(false);
    try {
      const response = await fetch(`/api/death-events/${encodeURIComponent(eventId)}/comments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        const signInRequired = response.status === 401 || response.status === 403;
        if (signInRequired) setCommentSignInRequired(true);
        setMessage(
          signInRequired
            ? "Sign in with an active member account to post a condolence."
            : (data.error ?? "Your condolence could not be posted."),
        );
        return;
      }
      setComment("");
      setMessage("Your condolence has been posted.");
      await load();
    } catch {
      setMessage("Your condolence could not be posted. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main>
      <p>
        <Link href="/death-support-events">← All Death Support Events</Link>
      </p>
      {message && <p role="status">{message}</p>}
      {event && (
        <>
          <article>
            <p className="eyebrow">
              {event.status === "CLOSED"
                ? "CLOSED DEATH SUPPORT EVENT"
                : "PUBLISHED DEATH SUPPORT EVENT"}
            </p>
            <h1>{event.memberName}</h1>
            <p>
              Date of death: {formatDate(event.dateOfDeath)}
              <br />
              Place of death: {event.placeOfDeath}
            </p>
            {event.publicDetails && <p>{event.publicDetails}</p>}
            <p className="muted">
              This notice intentionally excludes private evidence, internal review notes, nominee
              information, and bank details.
            </p>
          </article>

          <article>
            <h2>Condolences</h2>
            <p>Keep messages respectful and relevant. Authorized moderators may remove content.</p>
            {comments.length ? (
              comments.map((item) => (
                <section className="comment" key={item.externalId}>
                  <strong>{item.authorName}</strong>
                  <p>{item.body}</p>
                  <small>{new Date(item.createdAt).toLocaleString()}</small>
                </section>
              ))
            ) : (
              <p>No condolences have been posted yet.</p>
            )}
            {event.status === "PUBLISHED" ? (
              <form className="workflow-form" onSubmit={postCondolence}>
                <label>
                  Add a condolence
                  <textarea
                    value={comment}
                    onChange={(change) => setComment(change.target.value)}
                    required
                    minLength={2}
                    maxLength={1000}
                    placeholder="A respectful message of condolence"
                  />
                </label>
                <button type="submit" disabled={submitting}>
                  {submitting ? "Posting…" : "Post condolence"}
                </button>
                <p className="muted">Sign in with a member account to post a condolence.</p>
                {commentSignInRequired && (
                  <p>
                    <Link
                      href={`/login?next=${encodeURIComponent(`/death-support-events/${eventId}`)}`}
                    >
                      Sign in and return to this event
                    </Link>
                  </p>
                )}
              </form>
            ) : (
              <p className="muted">
                This Death Support Event is closed; new condolences are unavailable.
              </p>
            )}
          </article>
        </>
      )}
    </main>
  );
}
