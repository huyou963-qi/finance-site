"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { makeTr, type TextDict, type Tr } from "@/i18n/text";

const TextDictContext = createContext<TextDict | null>(null);

/** 根布局注入：英文站传英文字典，中文站传 null */
export function TextProvider({ dict, children }: { dict: TextDict | null; children: ReactNode }) {
  return <TextDictContext.Provider value={dict}>{children}</TextDictContext.Provider>;
}

/** 功能页文案：`const tr = useTr(); tr("宏观数据")` */
export function useTr(): Tr {
  const dict = useContext(TextDictContext);
  return useMemo(() => makeTr(dict), [dict]);
}
