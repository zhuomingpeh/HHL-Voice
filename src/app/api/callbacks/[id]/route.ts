import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();

  if (body.status !== "COMPLETED") {
    return NextResponse.json({ error: "Only status: COMPLETED is supported" }, { status: 400 });
  }

  const completedBy = typeof body.completedBy === "string" ? body.completedBy : undefined;

  const task = await prisma.callbackTask.update({
    where: { id },
    data: { status: "COMPLETED", completedAt: new Date(), completedBy },
  });

  return NextResponse.json({ task });
}
