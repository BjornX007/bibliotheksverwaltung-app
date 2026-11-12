
"use client";

import { useMemo, useState } from "react";

type RegistrationEvent = {
  id: string;
  method: "manual" | "scan" | "catalog" | "inventory";
  status: "success" | "failed" | "cancelled";
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  server_duration_ms: number | null;
  book_id: string | null;
  quantity: number | null;
  isbn: string | null;
  failure_code: string | null;
  created_at: string;
};

type Props = {
  events: RegistrationEvent[];
};

const methodLabels: Record<string, string> = {
  manual: "Manual",
  scan: "Barcode scan",
  catalog: "Catalog",
  inventory: "Inventory",
};

function formatDuration(value: number | null) {
  if (value === null) return "—";
  if (value < 1000) return `${value} ms`;
  return `${(value / 1000).toFixed(2)} s`;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function RegistrationAnalytics({ events }: Props) {
  const [method, setMethod] = useState("all");
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");

  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      const matchesMethod =
        method === "all" || event.method === method;

      const matchesStatus =
        status === "all" || event.status === status;

      const term = search.toLowerCase();

      const matchesSearch =
        !term ||
        event.isbn?.toLowerCase().includes(term) ||
        event.failure_code?.toLowerCase().includes(term) ||
        event.book_id?.toLowerCase().includes(term) ||
        event.method.toLowerCase().includes(term);

      return matchesMethod && matchesStatus && matchesSearch;
    });
  }, [events, method, status, search]);

  const successful = events.filter(
    (event) => event.status === "success"
  ).length;

  const failed = events.filter(
    (event) => event.status === "failed"
  ).length;

  const totalBooks = events
    .filter((event) => event.status === "success")
    .reduce((sum, event) => sum + (event.quantity ?? 0), 0);

  const durations = events
    .filter(
      (event) =>
        event.status === "success" &&
        event.duration_ms !== null
    )
    .map((event) => event.duration_ms as number);

  const averageDuration = durations.length
    ? Math.round(
        durations.reduce((sum, value) => sum + value, 0) /
          durations.length
      )
    : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">
          Registration analytics
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Track book registrations, methods, processing times and errors.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Total registrations"
          value={events.length}
          detail="All registration attempts"
        />
        <SummaryCard
          label="Books registered"
          value={totalBooks}
          detail={`${successful} successful registrations`}
        />
        <SummaryCard
          label="Failed registrations"
          value={failed}
          detail="Attempts that failed"
        />
        <SummaryCard
          label="Average duration"
          value={formatDuration(averageDuration)}
          detail="Client-side registration time"
        />
      </div>

      {/* Events table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-gray-200 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="font-semibold text-gray-900">
              Registration history
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              {filteredEvents.length} of {events.length} events
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search ISBN or ID..."
              className="h-10 rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />

            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none focus:border-blue-500"
            >
              <option value="all">All methods</option>
              <option value="manual">Manual</option>
              <option value="scan">Barcode scan</option>
              <option value="catalog">Catalog</option>
              <option value="inventory">Inventory</option>
            </select>

            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none focus:border-blue-500"
            >
              <option value="all">All statuses</option>
              <option value="success">Success</option>
              <option value="failed">Failed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-5 py-3 font-medium">Date</th>
                <th className="px-5 py-3 font-medium">Method</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 text-right font-medium">Quantity</th>
                <th className="px-5 py-3 font-medium">ISBN</th>
                <th className="px-5 py-3 font-medium">Duration</th>
                <th className="px-5 py-3 font-medium">Server time</th>
                <th className="px-5 py-3 font-medium">Details</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100">
              {filteredEvents.map((event) => (
                <tr
                  key={event.id}
                  className="transition hover:bg-gray-50"
                >
                  <td className="whitespace-nowrap px-5 py-4 text-gray-600">
                    {formatDate(event.created_at)}
                  </td>

                  <td className="px-5 py-4">
                    <span className="font-medium text-gray-800">
                      {methodLabels[event.method] ?? event.method}
                    </span>
                  </td>

                  <td className="px-5 py-4">
                    <StatusBadge status={event.status} />
                  </td>

                  <td className="px-5 py-4 text-right font-medium text-gray-800">
                    {event.quantity ?? "—"}
                  </td>

                  <td className="px-5 py-4 font-mono text-xs text-gray-600">
                    {event.isbn || "—"}
                  </td>

                  <td className="px-5 py-4 text-gray-600">
                    {formatDuration(event.duration_ms)}
                  </td>

                  <td className="px-5 py-4 text-gray-600">
                    {formatDuration(event.server_duration_ms)}
                  </td>

                  <td className="px-5 py-4">
                    {event.failure_code ? (
                      <span
                        className="font-medium text-red-600"
                        title={event.failure_code}
                      >
                        {event.failure_code}
                      </span>
                    ) : event.book_id ? (
                      <span className="text-gray-500" title={event.book_id}>
                        Book registered
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                </tr>
              ))}

              {filteredEvents.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-5 py-16 text-center text-gray-500"
                  >
                    No registration events found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string | number;
  detail: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-gray-500">{label}</p>
      <p className="mt-2 text-2xl font-bold tracking-tight text-gray-900">
        {value}
      </p>
      <p className="mt-1 text-xs text-gray-400">{detail}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    success: "bg-green-50 text-green-700 ring-green-600/20",
    failed: "bg-red-50 text-red-700 ring-red-600/20",
    cancelled: "bg-gray-100 text-gray-600 ring-gray-500/20",
  };

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium capitalize ring-1 ring-inset ${
        styles[status] ?? styles.cancelled
      }`}
    >
      {status}
    </span>
  );
}
