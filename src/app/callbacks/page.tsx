import { prisma } from "@/lib/prisma";
import { CompleteCallbackButton } from "@/components/CompleteCallbackButton";

export default async function CallbacksPage() {
  const tasks = await prisma.callbackTask.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: {
      customerRecord: {
        select: { name: true, phoneNumberRaw: true, phoneNumberE164: true, batchId: true },
      },
    },
  });

  const open = tasks.filter((t) => t.status === "OPEN");
  const completed = tasks.filter((t) => t.status === "COMPLETED");

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold">Callback tasks</h1>

      <Section title={`Open (${open.length})`} tasks={open} />
      <Section title={`Completed (${completed.length})`} tasks={completed} />
    </div>
  );
}

interface CallbackTaskRow {
  id: string;
  status: string;
  reason: string;
  summary: string | null;
  createdAt: Date;
  customerRecord: {
    name: string;
    phoneNumberRaw: string;
    phoneNumberE164: string | null;
    batchId: string;
  };
}

function Section({ title, tasks }: { title: string; tasks: CallbackTaskRow[] }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white">
      <h2 className="border-b border-neutral-200 px-4 py-3 font-medium">{title}</h2>
      {tasks.length === 0 ? (
        <p className="px-4 py-6 text-sm text-neutral-500">Nothing here.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-neutral-500">
              <th className="px-4 py-2 font-normal">Customer</th>
              <th className="px-4 py-2 font-normal">Phone</th>
              <th className="px-4 py-2 font-normal">Reason</th>
              <th className="px-4 py-2 font-normal">Summary</th>
              <th className="px-4 py-2 font-normal">Created</th>
              <th className="px-4 py-2 font-normal"></th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((task) => (
              <tr key={task.id} className="border-b border-neutral-100 last:border-0 align-top">
                <td className="px-4 py-2">
                  <a href={`/batches/${task.customerRecord.batchId}`} className="underline">
                    {task.customerRecord.name}
                  </a>
                </td>
                <td className="px-4 py-2">
                  {task.customerRecord.phoneNumberE164 ?? task.customerRecord.phoneNumberRaw}
                </td>
                <td className="px-4 py-2">{task.reason}</td>
                <td className="px-4 py-2 text-neutral-600">{task.summary ?? "—"}</td>
                <td className="px-4 py-2 text-neutral-500">
                  {task.createdAt.toLocaleString()}
                </td>
                <td className="px-4 py-2">
                  {task.status === "OPEN" && <CompleteCallbackButton taskId={task.id} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
