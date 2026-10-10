/**
 * 将 DOM 区域内的 canvas / SVG（ECharts、lightweight-charts、作图叠加层等）
 * 合成 PNG 并写入系统剪贴板。不依赖第三方库。
 */
export async function copyElementScreenshotToClipboard(
  el: HTMLElement,
  opts?: { backgroundColor?: string; pixelRatio?: number },
): Promise<void> {
  if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
    throw new Error("当前浏览器不支持复制图片到剪贴板");
  }

  // 先在点击事件内提交写入，再异步生成 PNG，保留 Safari 等浏览器要求的用户激活。
  const png = Promise.resolve().then(() => renderElementScreenshot(el, opts));
  // write 可能在消费图片前就因失焦被拒绝，仍须处理图片生成失败。
  void png.catch(() => {});
  const item = new ClipboardItem({ "image/png": png });
  try {
    if (!document.hasFocus()) await waitForScreenshotFocus();
    try {
      await navigator.clipboard.write([item]);
    } catch (e) {
      if (!isScreenshotFocusError(e)) throw e;
      // 仅对失焦重试一次，复用本次图片，不重复渲染或循环请求权限。
      await waitForScreenshotFocus();
      await navigator.clipboard.write([item]);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const name = e instanceof Error ? e.name : "";
    throw new Error(
      isScreenshotFocusError(e)
        ? "复制失败：页面未获得焦点，请返回图表页面后再次点击截图"
        : msg.includes("secure") || name === "NotAllowedError" || msg.includes("NotAllowed")
          ? "复制失败：请在本站页面内操作并允许剪贴板权限"
          : `复制到剪贴板失败：${msg}`,
    );
  }
}

function isScreenshotFocusError(error: unknown): boolean {
  return /document is not focused|页面未获得焦点/i.test(
    error instanceof Error ? error.message : String(error),
  );
}

function waitForScreenshotFocus(): Promise<void> {
  if (document.hasFocus()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      window.clearTimeout(timer);
      window.removeEventListener("focus", checkFocus);
      document.removeEventListener("visibilitychange", checkFocus);
    };
    const checkFocus = () => {
      if (!document.hasFocus()) return;
      cleanup();
      resolve();
    };
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("页面未获得焦点"));
    }, 1500);
    window.addEventListener("focus", checkFocus);
    document.addEventListener("visibilitychange", checkFocus);
    checkFocus();
  });
}

async function renderElementScreenshot(
  el: HTMLElement,
  opts?: { backgroundColor?: string; pixelRatio?: number },
): Promise<Blob> {
  const rootRect = el.getBoundingClientRect();
  const cssW = Math.max(1, Math.round(rootRect.width));
  const cssH = Math.max(1, Math.round(rootRect.height));
  if (cssW < 2 || cssH < 2) {
    throw new Error("图表区域尚未就绪");
  }

  const dpr = Math.min(Math.max(opts?.pixelRatio ?? window.devicePixelRatio ?? 1, 1), 2);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("无法创建画布");

  ctx.scale(dpr, dpr);
  const computedBg =
    getComputedStyle(el).backgroundColor ||
    getComputedStyle(document.body).backgroundColor ||
    "#ffffff";
  const bg = opts?.backgroundColor ?? computedBg;
  ctx.fillStyle = bg === "rgba(0, 0, 0, 0)" || bg === "transparent" ? "#ffffff" : bg;
  ctx.fillRect(0, 0, cssW, cssH);

  const canvases = Array.from(el.querySelectorAll("canvas"));
  const svgs = Array.from(el.querySelectorAll("svg"));
  if (canvases.length === 0 && svgs.length === 0) {
    throw new Error("未找到可截取的图表");
  }

  for (const node of canvases) {
    if (node.width < 1 || node.height < 1) continue;
    const r = node.getBoundingClientRect();
    if (!intersects(r, rootRect) || r.width < 1 || r.height < 1) continue;
    try {
      ctx.drawImage(
        node,
        r.left - rootRect.left,
        r.top - rootRect.top,
        r.width,
        r.height,
      );
    } catch {
      // 个别 canvas 可能被污染，跳过以免整张失败
    }
  }

  for (const svg of svgs) {
    const r = svg.getBoundingClientRect();
    if (!intersects(r, rootRect) || r.width < 1 || r.height < 1) continue;
    try {
      await drawSvgToContext(ctx, svg, r.left - rootRect.left, r.top - rootRect.top, r.width, r.height);
    } catch {
      // SVG 序列化失败时跳过
    }
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("导出 PNG 失败"))),
      "image/png",
    );
  });

}

function intersects(a: DOMRect, b: DOMRect): boolean {
  return !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
}

async function drawSvgToContext(
  ctx: CanvasRenderingContext2D,
  svg: SVGSVGElement,
  dx: number,
  dy: number,
  w: number,
  h: number,
): Promise<void> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  if (!clone.getAttribute("xmlns")) {
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  }
  if (!clone.getAttribute("width")) clone.setAttribute("width", String(w));
  if (!clone.getAttribute("height")) clone.setAttribute("height", String(h));

  const xml = new XMLSerializer().serializeToString(clone);
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
  const img = new Image();
  img.decoding = "sync";
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("SVG 渲染失败"));
    img.src = url;
  });
  ctx.drawImage(img, dx, dy, w, h);
}
