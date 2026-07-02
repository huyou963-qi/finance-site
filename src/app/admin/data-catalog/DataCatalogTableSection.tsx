"use client";

import { Fragment, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import type { AdminCatalogCountry, AdminCatalogIndicator } from "@/lib/data/scheduler/adminCatalog";

export type SortKey =
  | "label"
  | "frequency"
  | "dbSource"
  | "sourceLink"
  | "acquisition"
  | "latestValue"
  | "latestObsDate"
  | "nextRunAt"
  | "releasePlan"
  | "status";

export type SortDir = "asc" | "desc";

export const SORT_COLUMNS: { key: SortKey; label: string }[] = [
  { key: "label", label: "指标" },
  { key: "frequency", label: "频度" },
  { key: "dbSource", label: "库内来源" },
  { key: "sourceLink", label: "数据源链接" },
  { key: "acquisition", label: "获取方式" },
  { key: "latestValue", label: "最新值" },
  { key: "latestObsDate", label: "最新日期" },
  { key: "nextRunAt", label: "下次更新" },
  { key: "releasePlan", label: "更新计划" },
  { key: "status", label: "状态" },
];

export const COMPACT_DEFAULT_COLUMNS: SortKey[] = [
  "label",
  "frequency",
  "latestValue",
  "latestObsDate",
  "status",
];

type SyncReport = {
  ok: boolean;
  message: string;
  action: string;
};

type RowDeps = {
  formatValue: (value: number | null, unit: string | null) => string;
  formatDate: (iso: string | null) => string;
  formatDateTime: (iso: string | null) => string;
  SourceLinks: React.ComponentType<{ row: AdminCatalogIndicator }>;
  AcquisitionCell: React.ComponentType<{ row: AdminCatalogIndicator }>;
  CalendarSyncBadge: React.ComponentType<{ status: string }>;
  FetchRunBadge: React.ComponentType<{ row: AdminCatalogIndicator }>;
  SyncPackageButton: React.ComponentType<{
    instrumentCode: string;
    releasePackageId?: string | null;
    releasePackageLabelZh?: string | null;
    onDone: () => void;
    onReport: (report: SyncReport) => void;
  }>;
};

export function categoryExpandKey(countryCode: string, categoryName: string): string {
  return `category:${countryCode}:${categoryName}`;
}

export function subgroupExpandKey(countryCode: string, categoryName: string, subgroupName: string): string {
  return `subgroup:${countryCode}:${categoryName}:${subgroupName}`;
}

function categoryIndicatorCount(cat: AdminCatalogCountry["categories"][number]): number {
  const sub = (cat.subgroups ?? []).reduce((n, sg) => n + sg.indicators.length, 0);
  return cat.indicators.length + sub;
}

function countryIndicatorCount(country: AdminCatalogCountry): number {
  return country.categories.reduce((n, cat) => n + categoryIndicatorCount(cat), 0);
}

function acquisitionSortKey(row: AdminCatalogIndicator): string {
  if (row.networkAcquisitionConfirmed) return `0${row.fetchAcquisitionMethod ?? "已确认"}`;
  return "1待确定";
}

function statusSortKey(row: AdminCatalogIndicator): string {
  if (!row.networkAcquisitionConfirmed) return "0待确定";
  if (row.isStale) return "3未更新";
  if (row.updateStatus === "source_current") return "2源端暂无新值";
  if (row.updateStatus === "on_schedule") return "1等待下次更新";
  return "4";
}

function sourceLinkSortKey(row: AdminCatalogIndicator): string {
  return (row.agencyName ?? row.sourceName ?? row.sourcePageUrl ?? row.apiSourceUrl ?? "").toLowerCase();
}

function compareNullableString(a: string | null | undefined, b: string | null | undefined): number {
  const sa = (a ?? "").toLowerCase();
  const sb = (b ?? "").toLowerCase();
  if (!sa && !sb) return 0;
  if (!sa) return 1;
  if (!sb) return -1;
  return sa.localeCompare(sb, "zh-CN");
}

function compareNullableNumber(a: number | null, b: number | null): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a - b;
}

function compareNullableDate(a: string | null, b: string | null): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a.localeCompare(b);
}

function compareIndicators(a: AdminCatalogIndicator, b: AdminCatalogIndicator, key: SortKey): number {
  switch (key) {
    case "label":
      return compareNullableString(a.label, b.label);
    case "frequency":
      return compareNullableString(a.frequency, b.frequency);
    case "dbSource":
      return compareNullableString(a.dbSource, b.dbSource);
    case "sourceLink":
      return compareNullableString(sourceLinkSortKey(a), sourceLinkSortKey(b));
    case "acquisition":
      return compareNullableString(acquisitionSortKey(a), acquisitionSortKey(b));
    case "latestValue":
      return compareNullableNumber(a.latestValue, b.latestValue);
    case "latestObsDate":
      return compareNullableDate(a.latestObsDate, b.latestObsDate);
    case "nextRunAt":
      return compareNullableDate(a.nextRunAt, b.nextRunAt);
    case "releasePlan":
      return compareNullableString(a.releaseRuleSummary, b.releaseRuleSummary);
    case "status":
      return compareNullableString(statusSortKey(a), statusSortKey(b));
    default:
      return 0;
  }
}

function sortIndicators(rows: AdminCatalogIndicator[], key: SortKey, dir: SortDir): AdminCatalogIndicator[] {
  const mul = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => compareIndicators(a, b, key) * mul);
}

function StatusCell({
  row,
  onRefresh,
  showSyncButton,
  onSyncReport,
  deps,
}: {
  row: AdminCatalogIndicator;
  onRefresh: () => void;
  showSyncButton: boolean;
  onSyncReport: (report: SyncReport) => void;
  deps: RowDeps;
}) {
  const { FetchRunBadge, SyncPackageButton } = deps;
  return (
    <>
      {!row.networkAcquisitionConfirmed ? (
        <span className="text-amber-400">待确定</span>
      ) : row.isStale ? (
        <span className="text-fs-negative">未更新</span>
      ) : row.updateStatus === "source_current" ? (
        <span className="text-fs-muted">源端暂无新值</span>
      ) : row.updateStatus === "on_schedule" ? (
        <span className="text-fs-accent-text">等待下次更新</span>
      ) : (
        <span className="text-fs-muted">—</span>
      )}
      {row.networkAcquisitionConfirmed && row.staleReason ? (
        <div
          className={`mt-0.5 ${
            row.updateStatus === "source_current" ? "text-fs-muted" : "text-fs-negative/90"
          }`}
          title={row.staleReason}
        >
          {row.staleReason}
        </div>
      ) : null}
      {row.networkAcquisitionConfirmed && row.lastError ? (
        <div className="mt-1 truncate text-fs-negative" title={row.lastError}>
          {row.lastError}
        </div>
      ) : null}
      {row.networkAcquisitionConfirmed ? <FetchRunBadge row={row} /> : null}
      {row.networkAcquisitionConfirmed && row.instrumentCode && showSyncButton ? (
        <SyncPackageButton
          instrumentCode={row.instrumentCode}
          releasePackageId={row.releasePackageId}
          releasePackageLabelZh={row.releasePackageLabelZh}
          onDone={onRefresh}
          onReport={onSyncReport}
        />
      ) : row.networkAcquisitionConfirmed && row.instrumentCode && row.releasePackageId ? (
        <div className="mt-1 text-[10px] text-fs-muted">随发布包同步</div>
      ) : null}
    </>
  );
}

function RowDetailPanel({ row, deps }: { row: AdminCatalogIndicator; deps: RowDeps }) {
  const { formatDateTime, SourceLinks, AcquisitionCell } = deps;
  return (
    <div className="grid gap-3 text-xs text-fs-muted sm:grid-cols-2">
      <div>
        <div className="font-medium text-fs-secondary">库内来源</div>
        <div>{row.dbSource ?? "—"}</div>
      </div>
      <div>
        <div className="font-medium text-fs-secondary">数据源链接</div>
        <SourceLinks row={row} />
      </div>
      <div>
        <div className="font-medium text-fs-secondary">获取方式</div>
        <AcquisitionCell row={row} />
      </div>
      <div>
        <div className="font-medium text-fs-secondary">更新计划</div>
        <div>{row.releaseRuleSummary ?? "—"}</div>
        {row.calendarReleaseAt ? (
          <div className="mt-0.5">日历 {formatDateTime(row.calendarReleaseAt)}</div>
        ) : null}
      </div>
      {row.releasePackageLabelZh ? (
        <div>
          <div className="font-medium text-fs-secondary">发布包</div>
          <div className="text-sky-400">{row.releasePackageLabelZh}</div>
        </div>
      ) : null}
    </div>
  );
}

function IndicatorRow({
  row,
  indent,
  compact,
  visibleColumns,
  detailOpen,
  onToggleDetail,
  onRefresh,
  showSyncButton,
  onSyncReport,
  deps,
  colCount,
}: {
  row: AdminCatalogIndicator;
  indent: number;
  compact: boolean;
  visibleColumns: Set<SortKey>;
  detailOpen: boolean;
  onToggleDetail: () => void;
  onRefresh: () => void;
  showSyncButton: boolean;
  onSyncReport: (report: SyncReport) => void;
  deps: RowDeps;
  colCount: number;
}) {
  const router = useRouter();
  const py = compact ? "py-1" : "py-1.5";
  const pl = indent === 0 ? "pl-6" : indent === 1 ? "pl-10" : "pl-14";
  const cols = SORT_COLUMNS.filter((c) => visibleColumns.has(c.key));
  const { formatValue, formatDate, formatDateTime, SourceLinks, AcquisitionCell, CalendarSyncBadge } = deps;

  const openInMacro = (e: MouseEvent<HTMLTableRowElement>) => {
    if ((e.target as HTMLElement).closest("button, a")) return;
    router.push(`/macro?key=${encodeURIComponent(row.key)}&replace=1`);
  };

  const renderCell = (key: SortKey) => {
    switch (key) {
      case "label":
        return (
          <div>
            <div className="text-fs-text">{row.label}</div>
            <div className="mt-0.5 font-mono text-[10px] text-fs-muted">{row.key}</div>
            {row.instrumentCode ? (
              <div className="font-mono text-[10px] text-fs-secondary">{row.instrumentCode}</div>
            ) : null}
            {row.releasePackageLabelZh ? (
              <div className="mt-0.5 text-[10px] text-sky-500">发布包：{row.releasePackageLabelZh}</div>
            ) : null}
          </div>
        );
      case "frequency":
        return <span className="whitespace-nowrap text-fs-muted">{row.frequency}</span>;
      case "dbSource":
        return row.dbSource ?? <span className="text-fs-muted">—</span>;
      case "sourceLink":
        return <SourceLinks row={row} />;
      case "acquisition":
        return <AcquisitionCell row={row} />;
      case "latestValue":
        return (
          <span className="tabular-nums text-fs-secondary">
            {formatValue(row.latestValue, row.unit)}
          </span>
        );
      case "latestObsDate":
        return formatDate(row.latestObsDate);
      case "nextRunAt":
        return row.networkAcquisitionConfirmed ? formatDateTime(row.nextRunAt) : "—";
      case "releasePlan":
        return row.networkAcquisitionConfirmed ? (
          <>
            <div>{row.releaseRuleSummary ?? "—"}</div>
            {row.calendarReleaseAt ? (
              <div className="mt-1 text-fs-muted">
                日历发布 {formatDateTime(row.calendarReleaseAt)}
                {row.calendarEventTitle ? (
                  <span className="block truncate" title={row.calendarEventTitle}>
                    {row.calendarEventTitle}
                  </span>
                ) : null}
              </div>
            ) : null}
            {row.calendarSyncStatus ? <CalendarSyncBadge status={row.calendarSyncStatus} /> : null}
          </>
        ) : (
          "—"
        );
      case "status":
        return (
          <StatusCell
            row={row}
            onRefresh={onRefresh}
            showSyncButton={showSyncButton}
            onSyncReport={onSyncReport}
            deps={deps}
          />
        );
      default:
        return null;
    }
  };

  return (
    <Fragment>
      <tr
        className="cursor-pointer border-b border-fs-border/60 align-top text-xs hover:bg-fs-elevated/30"
        title="双击在宏观页查看"
        onDoubleClick={openInMacro}
      >
        <td className={`px-1 ${py}`}>
          <button
            type="button"
            onClick={onToggleDetail}
            className="text-fs-muted hover:text-fs-secondary"
            title="展开详情"
          >
            {detailOpen ? "▾" : "▸"}
          </button>
        </td>
        {cols.map((col) => (
          <td key={col.key} className={`px-2 ${py} ${col.key === "label" ? `${pl} pr-3` : ""} text-fs-secondary`}>
            {renderCell(col.key)}
          </td>
        ))}
      </tr>
      {detailOpen ? (
        <tr className="bg-fs-elevated/20">
          <td colSpan={colCount} className="px-3 py-2">
            <RowDetailPanel row={row} deps={deps} />
          </td>
        </tr>
      ) : null}
    </Fragment>
  );
}

function CatalogTableHeader({
  visibleColumns,
  sortKey,
  sortDir,
  onSort,
}: {
  visibleColumns: Set<SortKey>;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  const cols = SORT_COLUMNS.filter((c) => visibleColumns.has(c.key));
  return (
    <thead className="sticky top-0 z-10 bg-fs-bg text-xs text-fs-muted shadow-[0_1px_0_0_rgb(51_65_85)]">
      <tr className="border-b border-fs-border">
        <th className="w-8 px-2 py-2" />
        {cols.map((col) => {
          const active = sortKey === col.key;
          return (
            <th key={col.key} className="px-2 py-2 text-left font-medium">
              <button
                type="button"
                onClick={() => onSort(col.key)}
                className={`inline-flex items-center gap-1 hover:text-fs-text ${active ? "text-fs-text" : ""}`}
              >
                {col.label}
                <span className="text-[10px] text-fs-secondary">
                  {active ? (sortDir === "asc" ? "▲" : "▼") : "↕"}
                </span>
              </button>
            </th>
          );
        })}
      </tr>
    </thead>
  );
}

export function UnifiedCatalogTable({
  countries,
  expanded,
  rowExpanded,
  onToggle,
  onToggleRow,
  onRefresh,
  sortKey,
  sortDir,
  onSort,
  packageSyncLeaders,
  onSyncReport,
  visibleColumns,
  compact,
  deps,
}: {
  countries: AdminCatalogCountry[];
  expanded: Record<string, boolean>;
  rowExpanded: Record<string, boolean>;
  onToggle: (key: string) => void;
  onToggleRow: (key: string) => void;
  onRefresh: () => void;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
  packageSyncLeaders: Set<string>;
  onSyncReport: (report: SyncReport) => void;
  visibleColumns: Set<SortKey>;
  compact: boolean;
  deps: RowDeps;
}) {
  const cols = SORT_COLUMNS.filter((c) => visibleColumns.has(c.key));
  const colCount = cols.length + 1;

  const renderRows = (
    rows: AdminCatalogIndicator[],
    indent: number,
  ) =>
    sortIndicators(rows, sortKey, sortDir).map((row) => (
      <IndicatorRow
        key={row.key}
        row={row}
        indent={indent}
        compact={compact}
        visibleColumns={visibleColumns}
        detailOpen={rowExpanded[row.key] === true}
        onToggleDetail={() => onToggleRow(row.key)}
        onRefresh={onRefresh}
        showSyncButton={
          !row.instrumentCode || !row.releasePackageId || packageSyncLeaders.has(row.instrumentCode)
        }
        onSyncReport={onSyncReport}
        deps={deps}
        colCount={colCount}
      />
    ));

  return (
    <table className="w-full min-w-[720px] table-fixed text-left text-sm">
      <CatalogTableHeader
        visibleColumns={visibleColumns}
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={onSort}
      />
      <tbody>
        {countries.map((country) => {
          const countryKey = `country:${country.code}`;
          const countryOpen = expanded[countryKey] !== false;
          const totalCount = countryIndicatorCount(country);
          return (
            <Fragment key={country.code}>
              <tr className="bg-fs-elevated">
                <td colSpan={colCount} className="p-0">
                  <button
                    type="button"
                    onClick={() => onToggle(countryKey)}
                    className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-fs-elevated/80"
                  >
                    <span className="text-sm font-medium text-fs-text">
                      {country.name}
                      <span className="ml-2 font-normal text-fs-muted">{country.code}</span>
                    </span>
                    <span className="text-xs text-fs-muted">
                      {totalCount} 项 {countryOpen ? "▾" : "▸"}
                    </span>
                  </button>
                </td>
              </tr>
              {countryOpen
                ? country.categories.map((cat) => {
                    const catKey = categoryExpandKey(country.code, cat.name);
                    const catOpen = expanded[catKey] !== false;
                    const catCount = categoryIndicatorCount(cat);
                    if (catCount === 0) return null;
                    return (
                      <Fragment key={catKey}>
                        <tr className="bg-fs-elevated/35">
                          <td colSpan={colCount} className="p-0">
                            <button
                              type="button"
                              onClick={() => onToggle(catKey)}
                              className="flex w-full items-center justify-between py-1.5 pl-6 pr-3 text-left hover:bg-fs-elevated/60"
                            >
                              <span className="text-sm font-medium text-fs-secondary">{cat.name}</span>
                              <span className="text-xs text-fs-muted">
                                {catCount} 项 {catOpen ? "▾" : "▸"}
                              </span>
                            </button>
                          </td>
                        </tr>
                        {catOpen ? (
                          <>
                            {cat.indicators.length > 0 ? renderRows(cat.indicators, 0) : null}
                            {(cat.subgroups ?? []).map((sg) => {
                              const sgKey = subgroupExpandKey(country.code, cat.name, sg.name);
                              const sgOpen = expanded[sgKey] !== false;
                              if (!sg.indicators.length) return null;
                              return (
                                <Fragment key={sgKey}>
                                  <tr className="bg-fs-elevated/20">
                                    <td colSpan={colCount} className="p-0">
                                      <button
                                        type="button"
                                        onClick={() => onToggle(sgKey)}
                                        className="flex w-full items-center justify-between py-1.5 pl-10 pr-3 text-left hover:bg-fs-elevated/40"
                                      >
                                        <span className="text-xs font-medium text-fs-muted">{sg.name}</span>
                                        <span className="text-xs text-fs-muted">
                                          {sg.indicators.length} 项 {sgOpen ? "▾" : "▸"}
                                        </span>
                                      </button>
                                    </td>
                                  </tr>
                                  {sgOpen ? renderRows(sg.indicators, 2) : null}
                                </Fragment>
                              );
                            })}
                          </>
                        ) : null}
                      </Fragment>
                    );
                  })
                : null}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

export function filterCountry(
  country: AdminCatalogCountry,
  needle: string,
  onlySubscribed: boolean,
  onlyPending: boolean,
  onlyStale: boolean,
): AdminCatalogCountry {
  const filterRows = (rows: AdminCatalogIndicator[]) => {
    let indicators = rows;
    if (onlySubscribed) {
      indicators = indicators.filter((i) => i.networkAcquisitionConfirmed && i.hasScheduledUpdates);
    }
    if (onlyStale) indicators = indicators.filter((i) => i.isStale);
    if (onlyPending) indicators = indicators.filter((i) => !i.networkAcquisitionConfirmed);
    if (needle) {
      indicators = indicators.filter(
        (i) =>
          i.label.toLowerCase().includes(needle) ||
          i.key.toLowerCase().includes(needle) ||
          (i.instrumentCode?.toLowerCase().includes(needle) ?? false) ||
          i.categoryName.toLowerCase().includes(needle),
      );
    }
    return indicators;
  };

  const categories = country.categories
    .map((cat) => {
      const indicators = filterRows(cat.indicators);
      const subgroups = (cat.subgroups ?? [])
        .map((sg) => ({ ...sg, indicators: filterRows(sg.indicators) }))
        .filter((sg) => sg.indicators.length > 0);
      return { ...cat, indicators, subgroups: subgroups.length ? subgroups : undefined };
    })
    .filter(
      (c) => c.indicators.length > 0 || (c.subgroups?.some((sg) => sg.indicators.length > 0) ?? false),
    );
  return { ...country, categories };
}
