import assert from "node:assert/strict";
import test from "node:test";
import { geoOrthographic } from "d3-geo";
import {
  buildGlobeGeometry,
  daylightFactor,
  NIGHT_LIGHT_DAY,
  NIGHT_LIGHT_NIGHT,
  NIGHT_MAX_DARKNESS,
  nightTransmittance,
  PIXEL_BITS,
  TEXEL_FRACTION_BITS,
  TWILIGHT_BANDS,
  lightToAntisolarRadius,
} from "./globeLighting";

const RAD = Math.PI / 180;

test("昼夜覆盖层叠加后逼近原逐像素的 smoothstep 亮度曲线", () => {
  let worst = 0;
  let worstLight = 0;
  for (let i = 0; i <= 400; i += 1) {
    const light = -1 + (2 * i) / 400;
    const error = Math.abs(nightTransmittance(light) - daylightFactor(light));
    if (error > worst) {
      worst = error;
      worstLight = light;
    }
  }
  // 分档是对连续曲线的阶梯逼近，档数有限必然有残差；等亮度布档后应在 1.5% 以内
  assert.ok(worst < 0.015, `最大亮度偏差 ${worst.toFixed(4)} @ light=${worstLight.toFixed(3)}`);
});

test("全昼与全夜两端严格落在原曲线上", () => {
  assert.equal(nightTransmittance(1), 1);
  assert.ok(Math.abs(nightTransmittance(NIGHT_LIGHT_DAY) - 1) < 1e-9);
  // 深夜区亮度恒为 1 - NIGHT_MAX_DARKNESS
  for (const light of [NIGHT_LIGHT_NIGHT, -0.5, -1]) {
    assert.ok(
      Math.abs(nightTransmittance(light) - (1 - NIGHT_MAX_DARKNESS)) < 1e-9,
      `light=${light} → ${nightTransmittance(light)}`,
    );
  }
});

test("亮度随光照单调不减", () => {
  let previous = -Infinity;
  for (let i = 0; i <= 500; i += 1) {
    const value = nightTransmittance(-1 + (2 * i) / 500);
    assert.ok(value >= previous - 1e-12, `在 i=${i} 处出现回落`);
    previous = value;
  }
});

test("覆盖层圆心在对日点：圆内等价于 light <= -cos(r)", () => {
  const sun = { lon: 12, lat: 3 };
  const antisolar = [sun.lon + 180, -sun.lat] as const;
  const angularDistance = (lon: number, lat: number, to: readonly [number, number]) =>
    Math.acos(
      Math.max(-1, Math.min(1,
        Math.sin(lat * RAD) * Math.sin(to[1] * RAD)
        + Math.cos(lat * RAD) * Math.cos(to[1] * RAD) * Math.cos((lon - to[0]) * RAD))),
    ) / RAD;
  const illumination = (lon: number, lat: number) =>
    Math.sin(lat * RAD) * Math.sin(sun.lat * RAD)
    + Math.cos(lat * RAD) * Math.cos(sun.lat * RAD) * Math.cos((lon - sun.lon) * RAD);

  for (const radius of [78.46, 90, 109.9]) {
    for (let i = 0; i < 400; i += 1) {
      const lon = (i * 137.5) % 360 - 180;
      const lat = Math.asin(((i * 0.0049) % 2) - 1) / RAD;
      const inside = angularDistance(lon, lat, antisolar) <= radius;
      assert.equal(
        inside,
        illumination(lon, lat) <= -Math.cos(radius * RAD) + 1e-12,
        `r=${radius} lon=${lon} lat=${lat}`,
      );
    }
  }
});

test("晨昏辉光环带的内外边界不倒置", () => {
  for (const band of TWILIGHT_BANDS) {
    assert.ok(band.outer > band.inner, `环带 ${JSON.stringify(band)} 内外边界倒置`);
    assert.ok(band.alpha > 0);
  }
});

test("lightToAntisolarRadius 与 acos 互为反函数", () => {
  for (const light of [-1, -0.2, 0, 0.34, 1]) {
    const radius = lightToAntisolarRadius(light);
    assert.ok(Math.abs(-Math.cos(radius * RAD) - light) < 1e-12, `light=${light}`);
  }
});

test("buildGlobeGeometry 的解析式反解与 d3 的 invert 一致", () => {
  const size = 161;
  const textureWidth = 1774;
  const textureHeight = 887;
  for (const phi of [-78, -18, 0, 37, 78]) {
    const geometry = buildGlobeGeometry(size, phi, textureWidth, textureHeight);
    const projection = geoOrthographic()
      .clipAngle(90)
      .translate([size / 2, size / 2])
      .scale(size * 0.495)
      .rotate([0, phi, 0]);
    let worst = 0;
    for (let k = 0; k < geometry.count; k += 7) {
      const index = geometry.dst[k];
      const x = (index % size) + 0.5;
      const y = Math.floor(index / size) + 0.5;
      const expected = projection.invert?.([x, y]);
      if (!expected) continue;
      const lon = geometry.lonBase[k];
      const lat = 90 - (geometry.srcRow[k] / textureWidth) * 180 / textureHeight;
      // 经度在极点附近病态，按球面弦长比较；纬度经过行号量化，单独放宽
      const toVector = (a: number, b: number) =>
        [Math.cos(b * RAD) * Math.cos(a * RAD), Math.cos(b * RAD) * Math.sin(a * RAD), Math.sin(b * RAD)] as const;
      const u = toVector(expected[0], expected[1]);
      const v = toVector(lon, expected[1]);
      worst = Math.max(worst, Math.hypot(u[0] - v[0], u[1] - v[1], u[2] - v[2]));
      assert.ok(Math.abs(lat - expected[1]) < 180 / textureHeight, `纬度行号偏差过大 phi=${phi}`);
    }
    // lonBase 存成 Float32Array（每像素省一半内存），阈值按 float32 的 ~7 位有效数字定，
    // 换算到 900px 的球面上远小于一个像素
    assert.ok(worst < 1e-6, `phi=${phi} 经度最大球面误差 ${worst.toExponential(2)}`);
  }
});

test("PIXEL_BITS 的 alpha 打包与字节序无关", () => {
  const bytes = new Uint8Array(4);
  const word = new Uint32Array(bytes.buffer);
  for (const alpha of [0, 1, 127, 255]) {
    word[0] = PIXEL_BITS.alphaBits[alpha];
    assert.equal(bytes[3], alpha, `alpha=${alpha} 未落在第 4 字节`);
    assert.equal(bytes[0] | bytes[1] | bytes[2], 0, "alpha 位污染了 RGB");
  }
  word[0] = PIXEL_BITS.rgbMask;
  assert.equal(bytes[3], 0, "rgbMask 不应包含 alpha 位");
  assert.equal(bytes[0] & bytes[1] & bytes[2], 255, "rgbMask 应保留全部 RGB 位");
});

test("baseFixed 定点索引与 lonBase 一致", () => {
  const textureWidth = 1774;
  const geometry = buildGlobeGeometry(161, -18, textureWidth, 887);
  const fixedWidth = textureWidth << TEXEL_FRACTION_BITS;
  for (let k = 0; k < geometry.count; k += 3) {
    assert.ok(geometry.baseFixed[k] >= 0 && geometry.baseFixed[k] < fixedWidth, `第 ${k} 项越界`);
    const expected = ((geometry.lonBase[k] + 180) / 360) * fixedWidth;
    const delta = Math.abs(geometry.baseFixed[k] - expected);
    // 允许环绕处的一圈之差
    assert.ok(Math.min(delta, fixedWidth - delta) <= 1.5, `第 ${k} 项偏差 ${delta}`);
  }
});

test("定点索引保留亚纹素相位：自转一帧就有大量像素换纹素", () => {
  const textureWidth = 1774;
  const geometry = buildGlobeGeometry(320, -18, textureWidth, 887);
  const fixedWidth = textureWidth << TEXEL_FRACTION_BITS;
  const texelAt = (lambda: number) => {
    let shift = Math.round((-lambda / 360) * fixedWidth) % fixedWidth;
    if (shift < 0) shift += fixedWidth;
    const out = new Int32Array(geometry.count);
    for (let k = 0; k < geometry.count; k += 1) {
      let fixed = geometry.baseFixed[k] + shift;
      if (fixed >= fixedWidth) fixed -= fixedWidth;
      out[k] = fixed >> TEXEL_FRACTION_BITS;
    }
    return out;
  };
  // 自转速度约 0.0017°/ms，60fps 下每帧约 0.027°
  const before = texelAt(-104);
  const after = texelAt(-104 + 0.027);
  let moved = 0;
  for (let k = 0; k < geometry.count; k += 1) if (before[k] !== after[k]) moved += 1;
  const ratio = moved / geometry.count;
  // 若按整数纹素预存，同一 dx 会让全图要么全不动要么全跳；这里必须有一部分像素在动
  assert.ok(ratio > 0.02 && ratio < 0.6, `相邻帧变化占比 ${(ratio * 100).toFixed(1)}%，疑似同步跳变`);
});
