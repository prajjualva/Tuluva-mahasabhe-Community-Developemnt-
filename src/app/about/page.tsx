import type { Metadata } from "next";
import Link from "next/link";
import { PublicHeader } from "../components/public-header";
import { organization } from "../../content/organization";

export const metadata: Metadata = { title: "About us" };
export default function AboutPage() {
  return (
    <>
      <PublicHeader />
      <main className="organization-about">
        <section className="organization-about-hero">
          <p className="eyebrow">ABOUT TULUWORLD FOUNDATION</p>
          <h1>
            Our roots. Our people.
            <br />
            <em>Our shared future.</em>
          </h1>
          <p className="hero-description">{organization.introduction}</p>
          <p className="muted">Based in {organization.location}</p>
        </section>
        <section aria-labelledby="purpose-heading">
          <h2 id="purpose-heading">Culture and community, together.</h2>
          <p>{organization.purpose}</p>
          <div className="grid">
            {organization.pillars.map((pillar) => (
              <article key={pillar.title}>
                <h3>{pillar.title}</h3>
                <p>{pillar.description}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="home-callout">
          <div>
            <p className="eyebrow">COMMUNITY SUPPORT PLATFORM</p>
            <h2>Care, with clear responsibilities.</h2>
            <p>
              This platform connects members, Coordinators and Foundation administrators through
              membership records, contribution dues, receipts and reviewed support workflows.
            </p>
            <p>
              Community support is not insurance. Membership and support decisions follow the plan’s
              rules and review process.
            </p>
          </div>
          <Link className="button-link" href="/register">
            Become a member →
          </Link>
        </section>
        <section className="organization-source">
          <h2>Discover more about Tuluworld</h2>
          <p>Explore the Foundation’s wider cultural and community work on its official website.</p>
          <a href={organization.website} target="_blank" rel="noopener noreferrer">
            Visit the official Tuluworld website ↗
          </a>
          <p className="muted">
            Organisation information adapted from{" "}
            <a href={organization.website}>tuluworld.org.in</a>. Programme details on that website
            are separate from the membership and contribution rules of this platform.
          </p>
        </section>
      </main>
    </>
  );
}
