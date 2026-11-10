"use client";

import { useLocale } from "next-intl";
import { useMemo } from "react";
import { makePickLabel, type PickLabel } from "@/i18n/dataLabels";
import { useTr } from "@/i18n/TextProvider";

/** 数据文案显示：`pick(中文, 英文?)`，中文站原样返回 */
export function useDataLabel(): PickLabel {
  const locale = useLocale();
  const tr = useTr();
  return useMemo(() => makePickLabel(locale, (zh) => tr(zh)), [locale, tr]);
}
