import type { AppLocale } from "@/i18n/locales";
import type zh from "@/i18n/messages/zh.json";

/** 让 useTranslations / t() 按中文文案树做键名类型检查 */
declare module "next-intl" {
  interface AppConfig {
    Locale: AppLocale;
    Messages: typeof zh;
  }
}
