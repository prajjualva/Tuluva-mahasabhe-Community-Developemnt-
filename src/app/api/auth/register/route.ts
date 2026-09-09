import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { registerMemberPersistently } from "../../../../server/members/registration-service";

export async function POST(request: NextRequest) {
  try {
    const member = await registerMemberPersistently(await request.json());
    return NextResponse.json(member, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      return NextResponse.json(
        { error: "An account with that email or mobile already exists" },
        { status: 409 },
      );
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Registration failed" },
      { status: 400 },
    );
  }
}
