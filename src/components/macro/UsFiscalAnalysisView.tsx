"use client";

import { useEffect, useState } from "react";
import { useTr } from "@/i18n/TextProvider";
import type {
  UsFiscalView,
  UsFiscalViewsPayload,
} from "@/lib/data/usFiscalViewTypes";

let cached:
  | { expires: number; promise: Promise<UsFiscalViewsPayload> }
  | undefined;

function request() {
  if (cached && cached.expires > Date.now()) return cached.promise;
  const promise = fetch("/api/data/us-fiscal-views")
    .then(async (response) => {
      if (!response.ok) throw new Error("Fiscal data request failed");
      return response.json() as Promise<UsFiscalViewsPayload>;
    })
    .catch((error) => {
      if (cached?.promise === promise) cached = undefined;
      throw error;
    });
  cached = { expires: Date.now() + 30 * 60000, promise };
  return promise;
}

export function useUsFiscalViews(enabled: boolean) {
  const [payload, setPayload] = useState<UsFiscalViewsPayload | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    setFailed(false);
    request().then(
      (data) => {
        if (active) setPayload(data);
      },
      () => {
        if (active) setFailed(true);
      },
    );
    return () => {
      active = false;
    };
  }, [enabled, attempt]);
  return {
    payload,
    failed,
    retry: () => {
      setFailed(false);
      setAttempt((i) => i + 1);
    },
  };
}

export function UsFiscalDataTables({
  views,
  attribution,
}: {
  views: readonly UsFiscalView[];
  attribution?: string;
}) {
  const tr = useTr();
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {Array.from(new Map(views.map((view) => [view.id, view])).values()).map(
        (view) => (
          <details
            key={view.id}
            className="rounded-md border border-fs-border bg-fs-elevated/40 p-2"
          >
            <summary className="cursor-pointer text-xs font-medium text-fs-text">
              {view.title}
            </summary>
            <div className="my-2 text-[11px] text-fs-muted">
              {tr("数据截至")} {view.asOf}
            </div>
            <div className="overflow-x-auto">
              <table
                aria-label={view.title}
                className="w-full border-collapse text-right text-xs tabular-nums"
              >
                <thead>
                  <tr>
                    {view.table.columns.map((column) => (
                      <th
                        key={column}
                        scope="col"
                        className="whitespace-nowrap border-b border-fs-border px-2 py-2 font-medium"
                      >
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {view.table.rows.map((row, i) => (
                    <tr key={i}>
                      {row.map((value, j) => (
                        <td
                          key={j}
                          className="whitespace-nowrap border-b border-fs-border/60 px-2 py-1.5"
                        >
                          {typeof value === "number"
                            ? value.toLocaleString(undefined, {
                                maximumFractionDigits: 2,
                              })
                            : (value ?? "N/A")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="my-2 text-[11px] leading-relaxed text-fs-muted">
              {view.note}
            </p>
          </details>
        ),
      )}
      {attribution ? (
        <p className="text-[11px] text-fs-muted">{attribution}</p>
      ) : null}
    </div>
  );
}
