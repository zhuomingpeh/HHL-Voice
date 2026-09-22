import { prisma } from "@/lib/prisma";
import { UploadBatchForm } from "@/components/UploadBatchForm";
import { getTwilioClient, getTwilioConfig } from "@/lib/twilio";

async function fetchTwilioBalance(): Promise<{ balance: string; currency: string } | null> {
  const config = getTwilioConfig();
  if (!config) return null;
  try {
    const balance = await getTwilioClient(config).balance.fetch();
    return { balance: balance.balance, currency: balance.currency };
  } catch {
    return null;
  }
}

function statusBadge(status: string) {
  const colors: Record<string, string> = {
    DRAFT: "bg-neutral-100 text-neutral-700",
    VALIDATED: "bg-blue-100 text-blue-700",
    RUNNING: "bg-amber-100 text-amber-800",
    PAUSED: "bg-orange-100 text-orange-800",
    COMPLETED: "bg-green-100 text-green-800",
  };
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${colors[status] ?? ""}`}>
      {status}
    </span>
  );
}

export default async function DashboardPage() {
  const [batches, twilioBalance] = await Promise.all([
    prisma.batch.findMany({ orderBy: { createdAt: "desc" } }),
    fetchTwilioBalance(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-4">
        <div className="rounded-lg border border-neutral-200 bg-white p-3 text-sm">
          <p className="text-neutral-500">Twilio balance</p>
          <p className="text-xl font-semibold">
            {twilioBalance ? `${twilioBalance.currency} ${twilioBalance.balance}` : "—"}
          </p>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-white p-3 text-sm">
          <p className="text-neutral-500">OpenAI usage</p>
          <p className="text-sm text-neutral-400">
            Not available — needs a separate Admin API key (Costs API), not the regular project key.
          </p>
        </div>
      </div>

      <UploadBatchForm />

      <div className="rounded-lg border border-neutral-200 bg-white">
        <h2 className="border-b border-neutral-200 px-4 py-3 font-medium">
          Calling batches
        </h2>
        {batches.length === 0 ? (
          <p className="px-4 py-6 text-sm text-neutral-500">
            No batches uploaded yet.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-neutral-500">
                <th className="px-4 py-2 font-normal">File</th>
                <th className="px-4 py-2 font-normal">Uploaded</th>
                <th className="px-4 py-2 font-normal">Status</th>
                <th className="px-4 py-2 font-normal">Rows</th>
                <th className="px-4 py-2 font-normal"></th>
              </tr>
            </thead>
            <tbody>
              {batches.map((batch) => (
                <tr key={batch.id} className="border-b border-neutral-100 last:border-0">
                  <td className="px-4 py-2">{batch.filename}</td>
                  <td className="px-4 py-2 text-neutral-500">
                    {batch.createdAt.toLocaleString()}
                  </td>
                  <td className="px-4 py-2">{statusBadge(batch.status)}</td>
                  <td className="px-4 py-2 text-neutral-600">
                    {batch.validRows} valid / {batch.invalidRows} invalid / {batch.totalRows} total
                  </td>
                  <td className="px-4 py-2">
                    <a href={`/batches/${batch.id}`} className="text-neutral-900 underline">
                      View
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
