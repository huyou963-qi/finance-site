/** Best-effort evidence only: zero timing/size does not prove a failed download. */
export function collectAssetDiagnostics(message: string): Record<string, unknown> {
  if (typeof window === "undefined") return {};
  try {
    let reloadAttemptAt: string | null = null;
    try { reloadAttemptAt = sessionStorage.getItem("chunk-reload-attempt"); } catch { /* Private browsing may deny storage. */ }
    const failure = message.match(/https?:\/\/[^\s)]+\/_next\/static\/[^\s)]+/)?.[0];
    const cleanPath = (value: string) => {
      const url = new URL(value, window.location.href);
      return url.origin === window.location.origin ? url.pathname : undefined;
    };
    const entries = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
    const resources = entries.filter((entry) => cleanPath(entry.name)?.startsWith("/_next/static/"));
    const failedPath = failure ? cleanPath(failure) : undefined;
    const selected = failedPath
      ? resources.filter((entry) => cleanPath(entry.name) === failedPath).slice(-5)
      : resources.slice(-8);
    return {
      assetDiagnostics: {
        capturedAt: new Date().toISOString(),
        online: navigator.onLine,
        visibility: document.visibilityState,
        pageAgeMs: Math.round(performance.now()),
        failedPath,
        reloadAttemptAt,
        // Runtime hash identifies the client's build without exposing application state.
        runtimeScripts: Array.from(document.scripts).map((script) => cleanPath(script.src))
          .filter((path) => path?.includes("/_next/static/chunks/webpack-")).slice(0, 2),
        resources: selected.map((entry) => ({
          path: cleanPath(entry.name),
          startMs: Math.round(entry.startTime),
          durationMs: Math.round(entry.duration),
          transferSize: entry.transferSize,
          encodedBodySize: entry.encodedBodySize,
          decodedBodySize: entry.decodedBodySize,
          protocol: entry.nextHopProtocol,
          responseStatus: (entry as PerformanceResourceTiming & { responseStatus?: number }).responseStatus ?? null,
        })),
      },
    };
  } catch {
    return {};
  }
}
