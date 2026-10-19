import { ReactNode } from "react";
import { PublicHeader } from "../components/public-header";
export default function PublicReportLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <PublicHeader />
      <div className="public-content">{children}</div>
    </>
  );
}
