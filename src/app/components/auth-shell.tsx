import { ReactNode } from "react";
import { PublicHeader } from "./public-header";
export function AuthShell({
  children,
  registration = false,
}: {
  children: ReactNode;
  registration?: boolean;
}) {
  return (
    <>
      <PublicHeader />
      <main className="auth-layout">
        <section className="auth-story">
          <p className="eyebrow">TOGETHER, THROUGH EVERY SEASON</p>
          <h2>
            A stronger community.
            <br />
            Support that stays.
          </h2>
          <p>
            One secure place to manage your membership, support fellow members and stay connected to
            your Foundation.
          </p>
          <div className="story-line">
            <span>01</span>
            <p>
              <strong>Clear and accountable</strong>Every payment has a reference and an official
              receipt.
            </p>
          </div>
          <div className="story-line">
            <span>02</span>
            <p>
              <strong>People at the center</strong>Your Coordinator and Foundation Admin guide the
              important decisions.
            </p>
          </div>
          <div className="story-line">
            <span>03</span>
            <p>
              <strong>Your information, protected</strong>Private member records and restricted
              document access.
            </p>
          </div>
          <p className="auth-note">
            {registration
              ? "Have your active Coordinator referral code ready before joining."
              : "Member, Coordinator and Admin accounts use the same secure sign-in."}
          </p>
        </section>
        <section
          className="auth-card"
          aria-label={registration ? "Member registration" : "Account sign in"}
        >
          {children}
        </section>
      </main>
    </>
  );
}
