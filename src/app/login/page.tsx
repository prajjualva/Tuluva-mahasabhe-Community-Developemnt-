import { isEmailOnlyPilot } from "../../server/auth/otp-delivery";
import { PublicHeader } from "../components/public-header";
import { redirect } from "next/navigation";
import { readPageSession } from "../../server/http/page-session";
import { safeInternalRedirect } from "../../server/security/request-policy";
import LoginForm from "./login-form";
import { reviewPortalUrl } from "../../server/deployment/review-portal";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const session = await readPageSession();
  if (session) {
    const { next } = await searchParams;
    const destination = ["/account-unavailable", "/payment-review"].includes(session.dashboard)
      ? session.dashboard
      : safeInternalRedirect(next ?? null, session.dashboard);
    redirect(
      ["/", "/login", "/register"].includes(destination.split("?")[0])
        ? session.dashboard
        : destination,
    );
  }

  return (
    <>
      <PublicHeader />
      <LoginForm emailOnly={isEmailOnlyPilot()} reviewPortal={reviewPortalUrl()} />
    </>
  );
}
