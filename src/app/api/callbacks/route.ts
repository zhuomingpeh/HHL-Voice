import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { CallbackTaskStatus } from "@prisma/client";

export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get("status") as CallbackTaskStatus | null;

  const tasks = await prisma.callbackTask.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: "desc" },
    include: {
      customerRecord: {
        select: { name: true, phoneNumberRaw: true, phoneNumberE164: true, batchId: true },
      },
    },
  });

  return NextResponse.json({ tasks });
}
