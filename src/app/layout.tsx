import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  manifest: "/manifest.webmanifest",
  title: {
    default: "TuluWorld Foundation | Community Support",
    template: "%s | TuluWorld Foundation",
  },
  description:
    "The TuluWorld Foundation Community Support platform for membership, community contributions and accountable member services.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
