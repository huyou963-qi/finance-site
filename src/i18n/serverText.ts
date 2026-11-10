import { cache } from "react";
import { getRequestLocale } from "@/i18n/server";
import { makeTr, type TextDict, type Tr } from "@/i18n/text";
import { loadEnglishText } from "@/i18n/text/en";

/** 本次请求的功能页字典：中文站为 null */
export const getTextDict = cache(async (): Promise<TextDict | null> => {
  const { locale } = await getRequestLocale();
  return locale === "en" ? loadEnglishText() : null;
});

/** 服务端组件用：`const tr = await getServerTr()` */
export async function getServerTr(): Promise<Tr> {
  return makeTr(await getTextDict());
}
