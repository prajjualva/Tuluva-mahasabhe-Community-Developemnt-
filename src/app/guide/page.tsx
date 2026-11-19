import type { Metadata } from "next";
import Link from "next/link";
import { PublicHeader } from "../components/public-header";
import { GuideExplorer } from "./guide-explorer";
import { filterGuide, type GuideAudience } from "../../content/platform-guide";
import { requirePagePermission } from "../../server/http/page-authorize";
import { readPageSession } from "../../server/http/page-session";

export const metadata: Metadata = {
  title: "Platform Guide",
  description:
    "Understand membership, plan approvals, dues, wallet, receipts and Foundation workspaces.",
};

export default async function GuidePage({
  searchParams,
}: {
  searchParams: Promise<{ workspace?: string }>;
}) {
  const { workspace } = await searchParams;
  const session = await readPageSession();
  let audience: GuideAudience = "Member";
  if (workspace === "admin") {
    await requirePagePermission("admin:*", "/guide?workspace=admin");
    audience = "Admin";
  } else if (workspace === "coordinator") {
    await requirePagePermission("coordinator:members:manage", "/guide?workspace=coordinator");
    audience = "Coordinator";
  }
  const guides = filterGuide("", audience)
    .filter((entry) => !session || entry.id !== "registration")
    .map((entry) =>
      session && entry.id === "privacy"
        ? { ...entry, href: session.dashboard, action: "Open my dashboard" }
        : entry,
    );

  return (
    <>
      <PublicHeader />
      <main className="guide-page">
        <header className="guide-intro">
          <p className="eyebrow">THE PLATFORM, EXPLAINED</p>
          <h1>{audience} guide</h1>
          <p className="hero-description">
            Search for a task to see how it works and where to go next.
          </p>
        </header>
        <GuideExplorer guides={guides} />
        <footer className="guide-help">
          <h2>Need a person, not a page?</h2>
          <p>
            Your assigned Coordinator can help with membership and evidence requests. Contact the
            Foundation for Admin decisions or disputed records.
          </p>
          <Link href="/member/coordinator">Find my Coordinator →</Link>
          <p className="muted">
            Private screens require sign-in and the appropriate permissions. This guide does not
            grant access or replace an eligibility decision.
          </p>
        </footer>
      </main>
    </>
  );
}
