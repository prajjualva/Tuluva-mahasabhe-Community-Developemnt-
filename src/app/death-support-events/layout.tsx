import { ReactNode } from "react";
import Link from "next/link";
import { readPageSession } from "../../server/http/page-session";
import { PublicHeader } from "../components/public-header";
export default async function PublicEventsLayout({ children }: { children: ReactNode }) {
  const session = await readPageSession();
  return (
    <>
      <PublicHeader />
      <div className="public-content">
        <div className="events-navigation">
          <Link href={session?.dashboard ?? "/"}>{session ? "← Back to dashboard" : "← Home"}</Link>
        </div>
        {children}
      </div>
    </>
  );
}
