import { PublishedEventList } from "./published-event-list";
import Link from "next/link";

export default function DeathSupportEventsPage() {
  return (
    <main>
      <p className="eyebrow">COMMUNITY SUPPORT FOUNDATION</p>
      <h1>Death Support Events</h1>
      <p>
        These are verified, published community notices. Private evidence, internal notes, nominee
        information, and bank details are never published here.
      </p>
      {process.env.NODE_ENV !== "production" && (
        <p>
          <Link href="/demo#events">Explore the stakeholder demo →</Link>
        </p>
      )}
      <h2>Published community events</h2>
      <PublishedEventList />
    </main>
  );
}
