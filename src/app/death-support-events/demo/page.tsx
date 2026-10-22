import { notFound, redirect } from "next/navigation";
export default function DemoEventPage() {
  if (process.env.NODE_ENV === "production") notFound();
  redirect("/demo#events");
}
