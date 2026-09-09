import { NextResponse } from "next/server";
export const GET = () =>
  NextResponse.json({ service: "community-support-foundation", status: "ok" });
