"use client";

import { useEffect, useState } from "react";
import { CpiMomMatrixTable } from "@/components/macro/CpiMomMatrixTable";

export function CpiSubitemsClient() {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) return false;
        const j = (await r.json().catch(() => ({}))) as { user?: { role?: string } };
        return String(j.user?.role ?? "").trim().toLowerCase() === "admin";
      })
      .then((admin) => {
        if (!cancelled) setIsAdmin(admin);
      })
      .catch(() => {
        /* ignore */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 overflow-y-auto px-4 py-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold text-fs-text">
          {isAdmin ? "CPI 分项季调环比（BLS Table A）" : "CPI 分项季调环比"}
        </h1>
        <p className="text-sm text-fs-muted">
          {isAdmin
            ? "复刻 BLS「Percent changes in CPI-U」表：分项作行、最近数月的季调环比（MoM %）作列，末列为各分项权重。用于一眼定位当月通胀由哪些分项驱动。"
            : "分项作行、最近数月的季调环比（MoM %）作列，末列为各分项权重。用于一眼定位当月通胀由哪些分项驱动。"}
        </p>
      </header>
      <CpiMomMatrixTable />
    </div>
  );
}
