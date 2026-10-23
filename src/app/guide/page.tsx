import type { Metadata } from "next";
import Link from "next/link";
import { PublicHeader } from "../components/public-header";
import { GuideExplorer } from "./guide-explorer";

export const metadata: Metadata = {
  title: "Platform Guide",
  description:
    "Understand membership, plan approvals, dues, wallet, receipts and Foundation workspaces.",
};

export default function GuidePage() {
  return (
    <>
      <PublicHeader />
      <main className="guide-page">
        <header className="guide-intro">
          <p className="eyebrow">THE PLATFORM, EXPLAINED</p>
          <h1>
            A little clarity.
            <br />
            <em>Every step of the way.</em>
          </h1>
          <p className="hero-description">
            What each screen does, who can use it, and what happens next. Choose your role or search
            for a task, then open a guide.
          </p>
        </header>
        <GuideExplorer />
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
