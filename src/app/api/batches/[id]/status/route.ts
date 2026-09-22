import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { BatchStatus } from "@prisma/client";

const ALLOWED_TRANSITIONS: Record<BatchStatus, BatchStatus[]> = {
  DRAFT: ["RUNNING"],
  VALIDATED: ["RUNNING"],
  RUNNING: ["PAUSED", "COMPLETED"],
  PAUSED: ["RUNNING", "COMPLETED"],
  COMPLETED: [],
};

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const nextStatus = body.status as BatchStatus | undefined;

  if (!nextStatus || !(nextStatus in ALLOWED_TRANSITIONS)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const batch = await prisma.batch.findUnique({ where: { id } });
  if (!batch) {
    return NextResponse.json({ error: "Batch not found" }, { status: 404 });
  }

  if (!ALLOWED_TRANSITIONS[batch.status].includes(nextStatus)) {
    return NextResponse.json(
      { error: `Cannot move batch from ${batch.status} to ${nextStatus}` },
      { status: 400 }
    );
  }

  // NOTE: this only updates batch status for now. Actual call dispatch to
  // Twilio is wired in a later milestone (development priority #4) — see
  // requirements section 4/21. Starting a batch here does not yet place calls.
  const updated = await prisma.batch.update({
    where: { id },
    data: { status: nextStatus },
  });

  return NextResponse.json({ batch: updated });
}
