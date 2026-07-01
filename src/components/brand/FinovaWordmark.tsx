type FinovaWordmarkSize = "sm" | "md" | "hero";

type FinovaWordmarkProps = {
  size?: FinovaWordmarkSize;
  className?: string;
};

/** 单一设计坐标系，各尺寸仅缩放显示宽度，保证 i 上蓝点相对位置一致 */
const VIEW_W = 200;
const VIEW_H = 52;

const DISPLAY_WIDTH: Record<FinovaWordmarkSize, number> = {
  sm: 108,
  md: 132,
  hero: 200,
};

const TEXT_Y = 46;
const FONT_SIZE = 44;
const LETTER_SPACING = "-2.5";
const DOT = { cx: 31.5, cy: 10.5, r: 3.2 };

/**
 * Finova 艺术字标：Fin（石墨）+ ova（蓝），i 上 AI 节点。
 */
export function FinovaWordmark({
  size = "md",
  className = "",
}: FinovaWordmarkProps) {
  const width = DISPLAY_WIDTH[size];
  const height = Math.round((width * VIEW_H) / VIEW_W);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      role="img"
      aria-label="Finova"
      className={className}
    >
      <title>Finova</title>
      <text
        x={0}
        y={TEXT_Y}
        fontFamily="ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif"
        fontSize={FONT_SIZE}
        fontWeight="600"
        letterSpacing={LETTER_SPACING}
      >
        <tspan fill="#1a1a18">Fin</tspan>
        <tspan fill="#2383e2">ova</tspan>
      </text>
      <circle cx={DOT.cx} cy={DOT.cy} r={DOT.r} fill="#2383e2" />
    </svg>
  );
}
