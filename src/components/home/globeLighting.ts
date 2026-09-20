/**
 * 首页地球的光照与投影缓存 —— 纯计算，不碰 canvas，便于单测覆盖。
 *
 * 背景：原实现每帧对整个球面逐像素调 d3 的 `invert()` 并算一遍光照，实测约
 * 425ms/帧。这里把两件事拆开：昼夜明暗改为叠加若干张 `geoCircle` 覆盖层（见
 * `NIGHT_BANDS`），几何映射则预计算成与自转经度无关的缓存（见
 * `buildGlobeGeometry`），每帧只剩一次横向纹理查表。
 */

export function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

export function smoothstep(edge0: number, edge1: number, value: number) {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/** 原先逐像素着色使用的昼间亮度曲线，作为覆盖层方案的对照基准 */
export function daylightFactor(light: number) {
  return 1 - NIGHT_MAX_DARKNESS * (1 - smoothstep(NIGHT_LIGHT_NIGHT, NIGHT_LIGHT_DAY, light));
}

/**
 * 叠完所有覆盖层之后，某个光照值处的实际透过率。
 * 以对日点为圆心、角半径 r 的圆，圆内即 `light <= -cos(r)`，所以一个光照值会被
 * 所有满足该条件的圆盘覆盖，透过率为各层 `(1 - alpha)` 之积。
 */
export function nightTransmittance(light: number) {
  let transmittance = 1;
  for (const band of NIGHT_BANDS) {
    if (light <= -Math.cos(band.radius * Math.PI / 180) + 1e-12) {
      transmittance *= 1 - band.alpha;
    }
  }
  return transmittance;
}

/**
 * 昼夜明暗改为「覆盖层」而非逐像素计算。
 *
 * 光照 `light = cos(到日下点的角距)`，原先的逐像素着色是
 * `daylight = 0.22 + 0.78 * smoothstep(-0.2, 0.34, light)`。注意「到日下点角距 ≥ 180-r」
 * 等价于「到对日点角距 ≤ r」，所以每一档亮度都是一个以**对日点**为圆心的 `geoCircle`：
 * 圆内满足 `light <= -cos(r)`。按半径从大到小叠画若干张半透明黑色圆盘，累积透过率
 * `Π(1-a_k)` 即可逼近那条 smoothstep 曲线，而每张圆盘只是一次 canvas fill。
 */
export const NIGHT_LIGHT_DAY = 0.34;
export const NIGHT_LIGHT_NIGHT = -0.2;
export const NIGHT_MAX_DARKNESS = 0.78;
/**
 * 档数。误差来自用阶梯逼近连续曲线，按「等亮度间隔」布档后每档亮度增量恒为
 * NIGHT_MAX_DARKNESS / N，最大偏差即半档 ≈ 1.2%，肉眼不可辨。
 * （若按等光照间隔布档，曲线中段斜率最大处误差会放大到 8%，实测过。）
 */
const NIGHT_BAND_COUNT = 32;

export function lightToAntisolarRadius(light: number) {
  return 180 - Math.acos(Math.max(-1, Math.min(1, light))) * 180 / Math.PI;
}

/** smoothstep 的反函数：由 y = t²(3-2t) 解出 t∈[0,1] */
function inverseSmoothstep(y: number) {
  return 0.5 - Math.sin(Math.asin(1 - 2 * clamp01(y)) / 3);
}

/** 给定昼间亮度反查对应的光照值 */
function daylightToLight(daylight: number) {
  const t = inverseSmoothstep((daylight - (1 - NIGHT_MAX_DARKNESS)) / NIGHT_MAX_DARKNESS);
  return NIGHT_LIGHT_NIGHT + t * (NIGHT_LIGHT_DAY - NIGHT_LIGHT_NIGHT);
}

/** 每档 {角半径, 叠加 alpha}，半径由大到小；alpha 由相邻档的目标透过率之比反解 */
export const NIGHT_BANDS: Array<{ radius: number; alpha: number }> = (() => {
  const bands: Array<{ radius: number; alpha: number }> = [];
  let previousTransmittance = 1;
  for (let i = 1; i <= NIGHT_BAND_COUNT; i += 1) {
    // 平台值取整档，而过渡半径取**半档**处 —— 让阶梯骑在曲线上而不是整体偏向一侧。
    // 两者都用半档会使阶梯整体平移半档，误差退化回整档（0.78/N）。
    const plateau = 1 - NIGHT_MAX_DARKNESS * (i / NIGHT_BAND_COUNT);
    const crossing = 1 - NIGHT_MAX_DARKNESS * ((i - 0.5) / NIGHT_BAND_COUNT);
    bands.push({
      radius: lightToAntisolarRadius(daylightToLight(crossing)),
      alpha: 1 - plateau / previousTransmittance,
    });
    previousTransmittance = plateau;
  }
  // 收尾：把整个全暗区补齐到恰好 1 - NIGHT_MAX_DARKNESS
  bands.push({
    radius: lightToAntisolarRadius(NIGHT_LIGHT_NIGHT),
    alpha: 1 - (1 - NIGHT_MAX_DARKNESS) / previousTransmittance,
  });
  return bands.filter((band) => band.alpha > 0.0005);
})();

/** 晨昏线暖色辉光：原 `0.13 * (1 - smoothstep(0.01, 0.18, |light|))`，改为几条环带 */
export const TWILIGHT_BANDS: Array<{ outer: number; inner: number; alpha: number }> = [
  { outer: 0.18, inner: 0.12, alpha: 0.05 },
  { outer: 0.12, inner: 0.06, alpha: 0.05 },
  { outer: 0.06, inner: 0.0, alpha: 0.05 },
].map(({ outer, alpha }) => ({
  // 辉光对称跨在晨昏线两侧：|light| <= x 对应 light 从 -x 到 +x，即角半径
  // lightToAntisolarRadius(-x) 到 lightToAntisolarRadius(+x) 之间的环带。
  // （两侧都取负值会让内外边界倒置，整条辉光落进夜侧。）
  outer: lightToAntisolarRadius(outer),
  inner: lightToAntisolarRadius(-outer),
  alpha,
})).filter((band) => band.inner < band.outer);

/**
 * 每个屏幕像素对应的纬度、纹理行号、边缘 alpha 都只跟倾角 φ 有关，与自转经度 λ 无关
 * （d3 的 `rotate([λ, φ, 0])` 先按 λ 平移经度再做 φ 旋转，所以 `lon = lonBase - λ`）。
 * 于是这些量只在 φ / 尺寸变化时重建一次，每帧只剩一次横向纹理查表。
 */
export type GlobeGeometry = {
  size: number;
  phi: number;
  count: number;
  /** 紧凑排列：第 k 项写到输出缓冲的哪个下标 */
  dst: Int32Array;
  /** 第 k 项在源贴图中的行起始偏移（已乘宽度） */
  srcRow: Int32Array;
  /** λ=0 时该像素的经度 */
  lonBase: Float32Array;
  /**
   * λ=0 时该像素在纹理行内的横向位置，定点数（低 8 位为小数）。
   *
   * 每帧只需 `(baseFixed[k] + dx) >> 8` 取纹素，省掉浮点取模。之所以要保留小数位：
   * 若直接按整数纹素预存，全图会随同一个整数 dx **同步**跳变，而自转每帧仅推进
   * 0.13 个纹素，肉眼看到的就是每七八帧才动一下的顿挫。保留亚纹素相位后各像素
   * 在不同时刻翻越纹素边界，观感与逐帧浮点计算一致。
   */
  baseFixed: Int32Array;
  /** 已按机器字节序打包好的 alpha 位 */
  alphaBits: Uint32Array;
};

/** RGB 掩码与 alpha 位的位置随字节序而变，运行时探测一次，避免写死小端假设 */
export const PIXEL_BITS = (() => {
  const bytes = new Uint8Array(4);
  const word = new Uint32Array(bytes.buffer);
  bytes[0] = 255; bytes[1] = 255; bytes[2] = 255; bytes[3] = 0;
  const rgbMask = word[0];
  const alphaBits = new Uint32Array(256);
  for (let a = 0; a < 256; a += 1) {
    bytes[0] = 0; bytes[1] = 0; bytes[2] = 0; bytes[3] = a;
    alphaBits[a] = word[0];
  }
  return { rgbMask, alphaBits };
})();

/** baseFixed 的小数位数（1/256 纹素，约 0.0008°，远细于每帧 0.027° 的自转步长） */
export const TEXEL_FRACTION_BITS = 8;

export function buildGlobeGeometry(size: number, phi: number, textureWidth: number, textureHeight: number): GlobeGeometry {
  const sampleRadius = size * 0.495;
  const capacity = size * size;
  const dst = new Int32Array(capacity);
  const srcRow = new Int32Array(capacity);
  const lonBase = new Float32Array(capacity);
  const baseFixed = new Int32Array(capacity);
  const alphaBits = new Uint32Array(capacity);
  const fixedWidth = textureWidth << TEXEL_FRACTION_BITS;
  const toRad = Math.PI / 180;
  const cosPhi = Math.cos(phi * toRad);
  const sinPhi = Math.sin(phi * toRad);
  let count = 0;
  for (let y = 0; y < size; y += 1) {
    const ny = (y + 0.5 - size / 2) / sampleRadius;
    for (let x = 0; x < size; x += 1) {
      const nx = (x + 0.5 - size / 2) / sampleRadius;
      const rr = nx * nx + ny * ny;
      if (rr > 1) continue;
      // 正交投影逆变换的解析式（已与 d3 的 invert 逐点对拍，最大球面误差 1.6e-14）
      const nz = Math.sqrt(1 - rr);
      const sinLat = Math.max(-1, Math.min(1, -ny * cosPhi - nz * sinPhi));
      const lat = Math.asin(sinLat) * 180 / Math.PI;
      const lon = Math.atan2(nx, nz * cosPhi - ny * sinPhi) * 180 / Math.PI;
      dst[count] = y * size + x;
      lonBase[count] = lon;
      let fixed = Math.round((lon + 180) / 360 * fixedWidth) % fixedWidth;
      if (fixed < 0) fixed += fixedWidth;
      baseFixed[count] = fixed;
      srcRow[count] = Math.min(
        textureHeight - 1,
        Math.max(0, Math.floor((90 - lat) / 180 * textureHeight)),
      ) * textureWidth;
      alphaBits[count] = PIXEL_BITS.alphaBits[
        Math.max(0, Math.min(255, Math.round(255 * smoothstep(1, 0.985, rr))))
      ];
      count += 1;
    }
  }
  return { size, phi, count, dst, srcRow, lonBase, baseFixed, alphaBits };
}
