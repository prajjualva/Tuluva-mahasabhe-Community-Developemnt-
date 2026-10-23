import Link from "next/link";
import { PublicHeader } from "./components/public-header";
import { organization } from "../content/organization";

export default function Home() {
  return (
    <>
      <PublicHeader />
      <main className="home-page">
        <section className="home-hero">
          <p className="eyebrow">TULUWORLD FOUNDATION · COMMUNITY SUPPORT</p>
          <h1>
            Rooted in community.
            <br />
            <em>Here for one another.</em>
          </h1>
          <p className="hero-description">
            A TuluWorld Foundation platform connecting families, Coordinators and community support
            in one place.
          </p>
          <div className="hero-actions">
            <Link className="button-link" href="/register">
              Become a member <span aria-hidden="true">↗</span>
            </Link>
            <Link href="/login">Access your member portal →</Link>
          </div>
          <div className="hero-principles">
            <span>People first</span>
            <span>Transparent records</span>
            <span>Community care</span>
          </div>
        </section>
        <section className="organization-home-intro" aria-labelledby="organisation-heading">
          <div>
            <p className="eyebrow">ROOTED IN TULU NADU</p>
            <h2 id="organisation-heading">The organisation behind our community.</h2>
          </div>
          <div>
            <p>{organization.introduction}</p>
            <Link href="/about">About TuluWorld Foundation →</Link>
          </div>
        </section>
        <section className="home-services" aria-label="Foundation services">
          <p className="eyebrow">ONE CONNECTED FOUNDATION</p>
          <h2>Support made clear.</h2>
          <div className="grid">
            <article>
              <span className="service-number">01 / MEMBERSHIP</span>
              <h3>Your community, connected</h3>
              <p>
                Manage your profile, nominees, annual membership and Coordinator assignment from
                your private portal.
              </p>
              <Link href="/register">Join the Foundation →</Link>
            </article>
            <article>
              <span className="service-number">02 / ACCOUNTABILITY</span>
              <h3>Every contribution counts</h3>
              <p>
                View dues, choose a payment method and access your official receipts and Foundation
                Wallet history.
              </p>
              <Link href="/login">View member services →</Link>
            </article>
            <article>
              <span className="service-number">03 / COMMUNITY CARE</span>
              <h3>Stand with a family</h3>
              <p>
                Read officially published Death Support Events or submit a report for Coordinator
                and Admin review.
              </p>
              <Link href="/death-support-events">View support events →</Link>
            </article>
          </div>
        </section>
        <section className="home-guide" aria-labelledby="how-it-works-heading">
          <div>
            <p className="eyebrow">A CLEARER WAY FORWARD</p>
            <h2 id="how-it-works-heading">How it all connects.</h2>
            <p className="page-description">
              Start with a question. Open a step to see where it takes you.
            </p>
            <Link href="/guide">Explore the full platform guide →</Link>
          </div>
          <div>
            <details>
              <summary>01 — Your membership</summary>
              <p>
                Create your account, maintain your profile and nominee, and track your membership
                status in one private workspace.
              </p>
              <Link href="/member/membership">View membership →</Link>
            </details>
            <details>
              <summary>02 — Contributions & records</summary>
              <p>
                Review your dues, use an available payment method, and check confirmed wallet
                movements and official receipts.
              </p>
              <Link href="/member/payments-receipts">Open payments & receipts →</Link>
            </details>
            <details>
              <summary>03 — Support, with review</summary>
              <p>
                Submit a death report or read published events. The Foundation reviews evidence and
                eligibility before authorizing support.
              </p>
              <Link href="/guide">Understand the support process →</Link>
            </details>
          </div>
        </section>
        <section className="home-callout">
          <div>
            <p className="eyebrow">WHEN SUPPORT IS NEEDED</p>
            <h2>Tell the Foundation.</h2>
            <p>
              Anyone can submit a death report. Every report is reviewed before an official event is
              published.
            </p>
          </div>
          <Link className="button-link" href="/death-report">
            Submit a report →
          </Link>
        </section>
        <footer className="public-footer">
          TuluWorld Foundation · Community support, not insurance.{" "}
          <Link href="/about">About us</Link>
        </footer>
      </main>
    </>
  );
}
