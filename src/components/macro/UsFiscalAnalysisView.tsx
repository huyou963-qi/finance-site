"use client";

import { useEffect, useState } from "react";
import type { UsFiscalViewsPayload } from "@/lib/data/usFiscalViewTypes";

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
