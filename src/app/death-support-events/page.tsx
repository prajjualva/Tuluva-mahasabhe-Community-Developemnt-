import { PublishedEventList } from "./published-event-list";

export default function DeathSupportEventsPage() {
  return (
    <main>
      <p className="eyebrow">COMMUNITY SUPPORT FOUNDATION</p>
      <h1>Death Support Events</h1>
      <p>
        These are verified, published community notices. Private evidence, internal notes, nominee
        information, and bank details are never published here.
      </p>
      <PublishedEventList />
    </main>
  );
}
