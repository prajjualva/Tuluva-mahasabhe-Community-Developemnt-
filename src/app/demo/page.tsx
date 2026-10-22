import { notFound } from "next/navigation";
import { StakeholderDemo } from "./stakeholder-demo";

export default function DemoPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <StakeholderDemo />;
}
