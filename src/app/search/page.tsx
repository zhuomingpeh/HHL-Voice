import { prisma } from "@/lib/prisma";
import { callOutcomeLabel } from "@/lib/callOutcomes";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = q?.trim() ?? "";

  const records = query
    ? await prisma.customerRecord.findMany({
        where: {
          OR: [
            { name: { contains: query } },
            { phoneNumberRaw: { contains: query } },
            { phoneNumberE164: { contains: query } },
          ],
        },
        orderBy: { createdAt: "desc" },
        take: 50,
        include: {
          batch: { select: { id: true, filename: true } },
          calls: { orderBy: { createdAt: "desc" }, take: 1 },
        },
      })
    : [];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold">Search customers</h1>

      <form className="flex gap-2" action="/search" method="get">
        <input
          type="text"
          name="q"
          defaultValue={query}
          placeholder="Name or phone number"
          className="w-80 rounded border border-neutral-300 px-3 py-1.5 text-sm"
        />
        <button
          type="submit"
          className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white"
        >
          Search
        </button>
      </form>

      {query && (
        <div className="rounded-lg border border-neutral-200 bg-white">
          <h2 className="border-b border-neutral-200 px-4 py-3 font-medium">
            {records.length} result{records.length === 1 ? "" : "s"} for &quot;{query}&quot;
          </h2>
          {records.length === 0 ? (
            <p className="px-4 py-6 text-sm text-neutral-500">No matches.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-neutral-500">
                  <th className="px-4 py-2 font-normal">Name</th>
                  <th className="px-4 py-2 font-normal">Phone</th>
                  <th className="px-4 py-2 font-normal">Batch</th>
                  <th className="px-4 py-2 font-normal">Last outcome</th>
                  <th className="px-4 py-2 font-normal">Transcript</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr key={r.id} className="border-b border-neutral-100 last:border-0">
                    <td className="px-4 py-2">{r.name}</td>
                    <td className="px-4 py-2">{r.phoneNumberE164 ?? r.phoneNumberRaw}</td>
                    <td className="px-4 py-2">
                      <a href={`/batches/${r.batch.id}`} className="underline">
                        {r.batch.filename}
                      </a>
                    </td>
                    <td className="px-4 py-2">{callOutcomeLabel(r.calls[0]?.outcome)}</td>
                    <td className="px-4 py-2">
                      {r.calls[0] ? (
                        <a href={`/calls/${r.calls[0].id}`} className="underline">
                          View
                        </a>
                      ) : (
                        <span className="text-neutral-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
