"use client";

import { useEffect, useState } from "react";
import type { ContributionProgress } from "../../domain/contribution-progress";
import { EventCard } from "./event-card";

export type PublicDeathSupportEvent = {
  externalId: string;
  status: "PUBLISHED" | "CLOSED";
  memberName: string;
  dateOfDeath: string;
  placeOfDeath: string;
  publicDetails: string | null;
  publishedAt: string | null;
  contributionProgress?: ContributionProgress;
};

/** Deliberately renders only the allowlisted public event fields returned by the API. */
export function PublishedEventList() {
  const [events, setEvents] = useState<PublicDeathSupportEvent[]>([]);
  const [message, setMessage] = useState("Loading published events…");
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setFailed(false);
    setMessage("Loading published events…");
    void (async () => {
      try {
        const response = await fetch("/api/death-events");
        const data = (await response.json()) as {
          events?: PublicDeathSupportEvent[];
          error?: string;
        };
        if (!active) return;
        if (!response.ok) {
          setFailed(true);
          setMessage(data.error ?? "Published events are temporarily unavailable.");
          return;
        }
        const published = data.events ?? [];
        setEvents(published);
        setMessage(
          published.length ? "" : "There are no published Death Support Events at this time.",
        );
      } catch {
        if (active) {
          setFailed(true);
          setMessage("Published events are temporarily unavailable.");
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [attempt]);

  return (
    <section className="event-list" aria-live="polite">
      {message && <p role="status">{message}</p>}
      {failed && (
        <button onClick={() => setAttempt((value) => value + 1)}>Retry loading events</button>
      )}
      {events.map((event) => (
        <EventCard key={event.externalId} event={event} />
      ))}
    </section>
  );
}
