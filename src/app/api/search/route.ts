import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) {
    return NextResponse.json({ records: [] });
  }

  const records = await prisma.customerRecord.findMany({
    where: {
      OR: [
        { name: { contains: q } },
        { phoneNumberRaw: { contains: q } },
        { phoneNumberE164: { contains: q } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      batch: { select: { id: true, filename: true } },
      calls: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  return NextResponse.json({ records });
}
