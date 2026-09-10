"use client";

import { useEffect, useState } from "react";

type AssignedEvent = {
  externalId: string;
  memberName: string;
  dateOfDeath: string;
  placeOfDeath: string;
};
type Condolence = {
  externalId: string;
  authorName: string;
  body: string;
  createdAt: string;
};

/** Active Coordinators can only review condolences for events assigned to them. */
export function CoordinatorCommentModeration() {
  const [events, setEvents] = useState<AssignedEvent[]>([]);
  const [comments, setComments] = useState<Record<string, Condolence[]>>({});
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState<string | null>(null);

  const loadEvents = async () => {
    try {
      const response = await fetch("/api/coordinator/death-events");
      const data = (await response.json()) as { events?: AssignedEvent[]; error?: string };
      if (response.ok) setEvents(data.events ?? []);
      else setMessage(data.error ?? "Assigned Death Support Events are unavailable.");
    } catch {
      setMessage("Assigned Death Support Events are unavailable.");
    }
  };

  useEffect(() => {
    void loadEvents();
  }, []);

  const loadComments = async (eventExternalId: string) => {
    try {
      const response = await fetch(
        `/api/coordinator/death-events/${encodeURIComponent(eventExternalId)}/comments`,
      );
      const data = (await response.json()) as { comments?: Condolence[]; error?: string };
      if (response.ok)
        setComments((current) => ({ ...current, [eventExternalId]: data.comments ?? [] }));
      else setMessage(data.error ?? "Condolences could not be loaded.");
    } catch {
      setMessage("Condolences could not be loaded.");
    }
  };

  const moderate = async (eventExternalId: string, commentExternalId: string) => {
    const reason = window.prompt("Reason for moderation (required and recorded in audit log)");
    if (!reason?.trim()) return;
    setWorking(commentExternalId);
    try {
      const response = await fetch(
        `/api/coordinator/death-events/${encodeURIComponent(eventExternalId)}/comments/${encodeURIComponent(commentExternalId)}/moderate`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ reason }),
        },
      );
      const data = (await response.json()) as { error?: string };
      setMessage(
        response.ok
          ? "Comment moderated and audit recorded."
          : (data.error ?? "Moderation failed."),
      );
      await loadComments(eventExternalId);
    } catch {
      setMessage("Moderation failed. Please try again.");
    } finally {
      setWorking(null);
    }
  };

  return (
    <article>
      <h2>Assigned-event comment moderation</h2>
      <p>
        Remove only abusive, misleading, or irrelevant condolences. A reason is required and
        recorded for every moderation action.
      </p>
      {message && <p role="status">{message}</p>}
      {events.length ? (
        events.map((event) => (
          <section className="queue-item" key={event.externalId}>
            <strong>{event.memberName}</strong>
            <p>
              {new Date(event.dateOfDeath).toLocaleDateString()} · {event.placeOfDeath}
            </p>
            <button onClick={() => void loadComments(event.externalId)}>
              Review published condolences
            </button>
            {comments[event.externalId]?.length === 0 && <p>No published condolences to review.</p>}
            {comments[event.externalId]?.map((comment) => (
              <div className="comment" key={comment.externalId}>
                <strong>{comment.authorName}</strong>
                <p>{comment.body}</p>
                <small>{new Date(comment.createdAt).toLocaleString()}</small>
                <br />
                <button
                  onClick={() => void moderate(event.externalId, comment.externalId)}
                  disabled={working === comment.externalId}
                >
                  {working === comment.externalId ? "Moderating…" : "Moderate comment"}
                </button>
              </div>
            ))}
          </section>
        ))
      ) : (
        <p>No assigned published Death Support Events need moderation.</p>
      )}
    </article>
  );
}
