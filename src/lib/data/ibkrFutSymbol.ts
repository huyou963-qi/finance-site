/** 图表连续期货代码（MGC=F / MCL=F）。无 Node/TWS 依赖，可供客户端安全引用。 */
export function isIbkrContinuousFutChartSymbol(symbol: string): boolean {
  return /=F$/i.test(symbol.trim());
}
