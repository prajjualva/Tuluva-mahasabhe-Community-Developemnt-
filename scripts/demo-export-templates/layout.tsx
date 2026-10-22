import type { ReactNode } from "react";
import "./globals.css";
export const metadata = {
  title: "Tuluva Mahasabhe | Community Support Demo",
  description:
    "Explore the Community Support Foundation stakeholder demo. Simulated payments only.",
  robots: { index: false, follow: false },
};
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
