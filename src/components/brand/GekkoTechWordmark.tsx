import Image from "next/image";

type GekkoTechWordmarkSize = "sm" | "md" | "hero";

type GekkoTechWordmarkProps = {
  size?: GekkoTechWordmarkSize;
  className?: string;
};

const SOURCE_WIDTH = 1918;
const SOURCE_HEIGHT = 475;

const DISPLAY_WIDTH: Record<GekkoTechWordmarkSize, number> = {
  sm: 118,
  md: 150,
  hero: 230,
};

/**
 * GekkoTech 品牌标识：壁虎行情图形 + 定制 GekkoTech 字标。
 */
export function GekkoTechWordmark({
  size = "md",
  className = "",
}: GekkoTechWordmarkProps) {
  const width = DISPLAY_WIDTH[size];
  const height = Math.round((width * SOURCE_HEIGHT) / SOURCE_WIDTH);

  return (
    <Image
      src="/brand/gekkotech-wordmarks/gekkotech-wordmark-v1.png"
      alt="GekkoTech"
      width={width}
      height={height}
      className={className}
    />
  );
}
