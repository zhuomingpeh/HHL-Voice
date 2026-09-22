import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { BatchStatusControls } from "@/components/BatchStatusControls";
import { callOutcomeLabel } from "@/lib/callOutcomes";

export default async function BatchDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const batch = await prisma.batch.findUnique({
    where: { id },
    include: {
      records: {
        orderBy: { rowNumber: "asc" },
        include: { calls: { orderBy: { createdAt: "desc" }, take: 1 } },
      },
    },
  });

  if (!batch) notFound();

  const invalidRecords = batch.records.filter((r) => !r.isValid);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">{batch.filename}</h1>
          <p className="text-sm text-neutral-500">
            Uploaded {batch.createdAt.toLocaleString()} · Status:{" "}
            <span className="font-medium">{batch.status}</span>
          </p>
        </div>
        <BatchStatusControls batchId={batch.id} status={batch.status} />
      </div>

      {batch.status === "DRAFT" && (
        <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Note: starting a batch currently only marks it as running. Twilio call
          dispatch is wired up in a later milestone — no calls will be placed yet.
        </p>
      )}

      <div className="grid grid-cols-3 gap-4 text-sm">
        <div className="rounded border border-neutral-200 bg-white p-3">
          <p className="text-neutral-500">Total rows</p>
          <p className="text-xl font-semibold">{batch.totalRows}</p>
        </div>
        <div className="rounded border border-neutral-200 bg-white p-3">
          <p className="text-neutral-500">Valid</p>
          <p className="text-xl font-semibold text-green-700">{batch.validRows}</p>
        </div>
        <div className="rounded border border-neutral-200 bg-white p-3">
          <p className="text-neutral-500">Invalid</p>
          <p className="text-xl font-semibold text-red-700">{batch.invalidRows}</p>
        </div>
      </div>

      {invalidRecords.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-white">
          <h2 className="border-b border-red-200 bg-red-50 px-4 py-2 font-medium text-red-800">
            Validation errors ({invalidRecords.length}) — these rows will not be called
          </h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-neutral-500">
                <th className="px-4 py-2 font-normal">Row</th>
                <th className="px-4 py-2 font-normal">Name</th>
                <th className="px-4 py-2 font-normal">Contact Number</th>
                <th className="px-4 py-2 font-normal">Due Date</th>
                <th className="px-4 py-2 font-normal">Errors</th>
              </tr>
            </thead>
            <tbody>
              {invalidRecords.map((r) => (
                <tr key={r.id} className="border-b border-neutral-100 last:border-0">
                  <td className="px-4 py-2">{r.rowNumber}</td>
                  <td className="px-4 py-2">{r.name || "—"}</td>
                  <td className="px-4 py-2">{r.phoneNumberRaw || "—"}</td>
                  <td className="px-4 py-2">
                    {r.dueDate.getTime() === 0 ? "—" : r.dueDate.toLocaleDateString()}
                  </td>
                  <td className="px-4 py-2 text-red-700">
                    {(r.validationErrors as string[])?.join("; ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="rounded-lg border border-neutral-200 bg-white">
        <h2 className="border-b border-neutral-200 px-4 py-3 font-medium">
          All records ({batch.records.length})
        </h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-neutral-500">
              <th className="px-4 py-2 font-normal">Row</th>
              <th className="px-4 py-2 font-normal">Name</th>
              <th className="px-4 py-2 font-normal">Contact Number</th>
              <th className="px-4 py-2 font-normal">Due Date</th>
              <th className="px-4 py-2 font-normal">Amount</th>
              <th className="px-4 py-2 font-normal">Valid</th>
              <th className="px-4 py-2 font-normal">Last call outcome</th>
            </tr>
          </thead>
          <tbody>
            {batch.records.map((r) => (
              <tr key={r.id} className="border-b border-neutral-100 last:border-0">
                <td className="px-4 py-2">{r.rowNumber}</td>
                <td className="px-4 py-2">{r.name || "—"}</td>
                <td className="px-4 py-2">{r.phoneNumberE164 ?? r.phoneNumberRaw}</td>
                <td className="px-4 py-2">
                  {r.dueDate.getTime() === 0 ? "—" : r.dueDate.toLocaleDateString()}
                </td>
                <td className="px-4 py-2">
                  {r.outstandingAmount != null ? `$${r.outstandingAmount.toString()}` : "—"}
                </td>
                <td className="px-4 py-2">
                  {r.isValid ? (
                    <span className="text-green-700">Yes</span>
                  ) : (
                    <span className="text-red-700">No</span>
                  )}
                </td>
                <td className="px-4 py-2">{callOutcomeLabel(r.calls[0]?.outcome)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
