/**
 * 按原始非空观测顺序计算向后移动平均；统一时间轴中属于其他序列的空档不计入窗口。
 * 当前观测前不足一个完整窗口时输出空值。
 */
export function trailingMean(
  values: readonly (number | null)[],
  window: number,
): (number | null)[] {
  const size = Math.trunc(window);
  if (!Number.isFinite(window) || size < 1) return [...values];

  const output: (number | null)[] = Array.from({ length: values.length }, () => null);
  const windowValues: number[] = [];
  let sum = 0;
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value == null || !Number.isFinite(value)) continue;
    windowValues.push(value);
    sum += value;
    if (windowValues.length > size) sum -= windowValues.shift()!;
    if (windowValues.length === size) output[index] = sum / size;
  }
  return output;
}
