import { DeathReportForm } from "./death-report-form";

/** Public entry point. Reporting a death must not require a member session. */
export default function DeathReportPage() {
  return (
    <main>
      <p className="eyebrow">COMMUNITY SUPPORT FOUNDATION</p>
      <h1>Report a death</h1>
      <p>
        Please search for the member first. A report is reviewed before it becomes a public Death
        Support Event or creates any contribution due.
      </p>
      <DeathReportForm />
    </main>
  );
}
