export const ERROR_REPORT_SOURCES = ["auto_crash", "auto_window", "manual"] as const;
export type ErrorReportSource = (typeof ERROR_REPORT_SOURCES)[number];

export const ERROR_REPORT_STATUSES = [
  "open",
  "acknowledged",
  "resolved",
  "ignored",
] as const;
export type ErrorReportStatus = (typeof ERROR_REPORT_STATUSES)[number];

export const ERROR_REPORT_STATUS_LABELS: Record<ErrorReportStatus, string> = {
  open: "待处理",
  acknowledged: "已确认",
  resolved: "已解决",
  ignored: "已忽略",
};

export const ERROR_REPORT_SOURCE_LABELS: Record<ErrorReportSource, string> = {
  auto_crash: "页面崩溃",
  auto_window: "未捕获异常",
  manual: "手动报告",
};

export const MAX_MESSAGE_LEN = 2000;
export const MAX_STACK_LEN = 16_384;
export const MAX_USER_NOTE_LEN = 2000;
export const MAX_PAGE_URL_LEN = 2000;
export const MAX_DIGEST_LEN = 200;
