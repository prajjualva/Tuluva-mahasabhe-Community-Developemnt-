import { redirect } from "next/navigation";
import { readPageSession } from "../../server/http/page-session";
import { PublicHeader } from "../components/public-header";
import RegisterForm from "./register-form";

export default async function RegisterPage() {
  const session = await readPageSession();
  if (session) redirect(session.dashboard);

  return (
    <>
      <PublicHeader />
      <RegisterForm />
    </>
  );
}
