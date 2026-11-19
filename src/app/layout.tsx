import "./globals.css";
import type { Metadata } from "next";
import { applicationBrand } from "../content/organization";

export const metadata: Metadata = {
  manifest: "/manifest.webmanifest",
  title: {
    default: applicationBrand.name + " | Tuluworld Foundation",
    template: "%s | Tuluva Mahasabhe",
  },
  description: applicationBrand.fullName,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
