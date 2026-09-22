import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseCsv } from "@/lib/csv";

export async function GET() {
  const batches = await prisma.batch.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      filename: true,
      status: true,
      totalRows: true,
      validRows: true,
      invalidRows: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ batches });
}

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }
  if (!file.name.toLowerCase().endsWith(".csv")) {
    return NextResponse.json({ error: "File must be a .csv" }, { status: 400 });
  }

  const content = await file.text();
  const { rows, emptyRowNumbers, headerError } = parseCsv(content);

  if (headerError) {
    return NextResponse.json({ error: headerError }, { status: 400 });
  }
  if (rows.length === 0) {
    return NextResponse.json(
      { error: "CSV contains no data rows" },
      { status: 400 }
    );
  }

  const validRows = rows.filter((r) => r.isValid).length;
  const invalidRows = rows.length - validRows;

  const batch = await prisma.batch.create({
    data: {
      filename: file.name,
      totalRows: rows.length,
      validRows,
      invalidRows,
      records: {
        create: rows.map((row) => ({
          rowNumber: row.rowNumber,
          name: row.name,
          phoneNumberRaw: row.phoneNumberRaw,
          phoneNumberE164: row.phoneNumberE164,
          dueDate: row.dueDate ?? new Date(0), // placeholder for unparseable dates; row is marked invalid
          remarks: row.remarks,
          outstandingAmount: row.outstandingAmount,
          isValid: row.isValid,
          validationErrors: row.errors,
        })),
      },
    },
    select: { id: true },
  });

  return NextResponse.json(
    {
      batchId: batch.id,
      totalRows: rows.length,
      validRows,
      invalidRows,
      emptyRowsSkipped: emptyRowNumbers.length,
      emptyRowNumbers,
    },
    { status: 201 }
  );
}
