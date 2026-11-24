import "./globals.css";
import type { Metadata } from "next";
import { applicationBrand } from "../content/organization";
import { isReviewWorkspace } from "../server/deployment/review-environment";

export const metadata: Metadata = {
  manifest: "/manifest.webmanifest",
  title: {
    default: applicationBrand.name + " | Tuluworld Foundation",
    template: "%s | Tuluva Mahasabhe",
  },
  description: applicationBrand.fullName,
  ...(isReviewWorkspace() ? { robots: { index: false, follow: false } } : {}),
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        {isReviewWorkspace() && (
          <aside className="review-workspace-banner" aria-label="Test workspace">
            <strong>Reviewer test workspace</strong> · Sample records and test money only.
            <a href="/review-guide">Testing guide</a>
          </aside>
        )}
        {children}
      </body>
    </html>
  );
}
