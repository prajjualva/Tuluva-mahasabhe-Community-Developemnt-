import Link from "next/link";
import type { ContributionProgress } from "../../domain/contribution-progress";
import type { PublicDeathSupportEvent } from "./published-event-list";

export function EventProgress({ progress }: { progress: ContributionProgress }) {
  const percent = progress.total ? Math.floor((progress.contributed * 100) / progress.total) : 0;
  return (
    <section className="event-progress" aria-label="Contribution progress">
      <div className="event-progress-heading">
        <strong>Community contributions</strong>
        <span>{percent}% paid</span>
      </div>
      <progress
        max={progress.total || 1}
        value={progress.contributed}
        aria-label={`${progress.contributed} of ${progress.total} contributions paid`}
      />
      <div className="event-progress-stats">
        <div>
          <strong>{progress.contributed.toLocaleString("en-IN")}</strong>
          <span>Contributed</span>
        </div>
        <div>
          <strong>{progress.remaining.toLocaleString("en-IN")}</strong>
          <span>Remaining dues</span>
        </div>
        <div>
          <strong>{progress.total.toLocaleString("en-IN")}</strong>
          <span>Total obligations</span>
        </div>
      </div>
      {(progress.waived > 0 || progress.cancelled > 0) && (
        <small>
          {progress.waived} waived · {progress.cancelled} cancelled (not counted as paid)
        </small>
      )}
      <p className="muted">
        Contribution progress is separate from support eligibility and does not confirm a support
        payout.
      </p>
    </section>
  );
}

export function EventCard({ event }: { event: PublicDeathSupportEvent }) {
  return (
    <article className="memorial-card">
      <div className="memorial-portrait">
        <div className="memorial-monogram" aria-label="Member portrait not published">
          {event.memberName
            .split(/\s+/)
            .slice(0, 2)
            .map((word) => word[0])
            .join("")}
        </div>
        <span className="memorial-ribbon">IN LOVING MEMORY</span>
      </div>
      <div className="memorial-content">
        <p className="eyebrow">
          {event.status === "CLOSED" ? "CLOSED EVENT" : "VERIFIED COMMUNITY NOTICE"}
        </p>
        <h2>{event.memberName}</h2>
        <p className="muted">
          {new Date(event.dateOfDeath).toLocaleDateString("en-IN", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}{" "}
          · {event.placeOfDeath}
        </p>
        {event.publicDetails && <p>{event.publicDetails}</p>}
        {event.contributionProgress && <EventProgress progress={event.contributionProgress} />}
        <Link
          className="event-view-link"
          href={`/death-support-events/${encodeURIComponent(event.externalId)}`}
        >
          View event & condolences <span aria-hidden="true">→</span>
        </Link>
      </div>
    </article>
  );
}
