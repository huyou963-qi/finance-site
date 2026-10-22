/** 保留拒绝原因的类型；JSON.stringify(undefined/function/symbol) 不会返回字符串。 */
export function describeRejection(reason: unknown): {
  message: string;
  stack?: string;
  reasonType: string;
} {
  const reasonType = reason === null ? "null" : typeof reason;
  if (reason instanceof Error) {
    return { message: reason.message || "unhandledrejection", stack: reason.stack, reasonType };
  }
  if (typeof reason === "string") {
    return { message: reason || "unhandledrejection (empty string)", reasonType };
  }
  let message: string;
  try {
    message = JSON.stringify(reason) ?? `unhandledrejection (${reasonType})`;
  } catch {
    message = `unhandledrejection (${reasonType}; not JSON serializable)`;
  }
  return { message, reasonType };
}
