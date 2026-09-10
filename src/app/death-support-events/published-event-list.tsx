"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export type PublicDeathSupportEvent = {
  externalId: string;
  status: "PUBLISHED" | "CLOSED";
  memberName: string;
  dateOfDeath: string;
  placeOfDeath: string;
  publicDetails: string | null;
  publishedAt: string | null;
};

function formatDate(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Date not available" : parsed.toLocaleDateString();
}

/** Deliberately renders only the allowlisted public event fields returned by the API. */
export function PublishedEventList() {
  const [events, setEvents] = useState<PublicDeathSupportEvent[]>([]);
  const [message, setMessage] = useState("Loading published events…");

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch("/api/death-events");
        const data = (await response.json()) as {
          events?: PublicDeathSupportEvent[];
          error?: string;
        };
        if (!active) return;
        if (!response.ok) {
          setMessage(data.error ?? "Published events are temporarily unavailable.");
          return;
        }
        const published = data.events ?? [];
        setEvents(published);
        setMessage(
          published.length ? "" : "There are no published Death Support Events at this time.",
        );
      } catch {
        if (active) setMessage("Published events are temporarily unavailable.");
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <section className="event-list" aria-live="polite">
      {message && <p role="status">{message}</p>}
      {events.map((event) => (
        <article key={event.externalId}>
          <p className="eyebrow">
            {event.status === "CLOSED"
              ? "CLOSED DEATH SUPPORT EVENT"
              : "PUBLISHED DEATH SUPPORT EVENT"}
          </p>
          <h2>{event.memberName}</h2>
          <p>
            {formatDate(event.dateOfDeath)} · {event.placeOfDeath}
          </p>
          {event.publicDetails && <p>{event.publicDetails}</p>}
          <Link href={`/death-support-events/${encodeURIComponent(event.externalId)}`}>
            View event and condolences
          </Link>
        </article>
      ))}
    </section>
  );
}
