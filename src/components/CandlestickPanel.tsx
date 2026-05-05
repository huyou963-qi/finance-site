"use client";

import {
  StockChartWorkspace,
  type StockChartWorkspaceProps,
} from "@/components/StockChartWorkspace";

export type CandlestickPanelProps = StockChartWorkspaceProps;

/** K 线看盘（多窗格 + 画线），与 StockChartWorkspace 相同 */
export function CandlestickPanel(props: CandlestickPanelProps) {
  return <StockChartWorkspace {...props} />;
}
