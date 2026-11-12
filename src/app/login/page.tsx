import { isEmailOnlyPilot } from "../../server/auth/otp-delivery";
import LoginForm from "./login-form";

export default function LoginPage() {
  return <LoginForm emailOnly={isEmailOnlyPilot()} />;
}
