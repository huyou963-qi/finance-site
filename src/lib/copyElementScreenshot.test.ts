import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { copyElementScreenshotToClipboard } from "./copyElementScreenshot";

function setup(t: TestContext) {
  const events = new EventTarget();
  const documentEvents = new EventTarget();
  const blob = new Blob(["png"], { type: "image/png" });
  const rect = { left: 0, top: 0, right: 200, bottom: 100, width: 200, height: 100 };
  let focused = true;
  let renders = 0;
  let timer: (() => void) | undefined;
  let cleared = 0;
  const ctx = { scale() {}, fillRect() {}, drawImage() {} };
  const canvas = {
    width: 200, height: 100,
    getBoundingClientRect: () => rect,
    getContext: () => ctx,
    toBlob(callback: (value: Blob) => void) { renders++; callback(blob); },
  };
  const el = {
    getBoundingClientRect: () => rect,
    querySelectorAll: (selector: string) => selector === "canvas" ? [canvas] : [],
  } as unknown as HTMLElement;
  class Item {
    constructor(public data: Record<string, Promise<Blob>>) {}
  }
  const clipboard = { write: async (items: Item[]) => { await items[0].data["image/png"]; } };
  const globals = {
    navigator: { clipboard },
    ClipboardItem: Item,
    getComputedStyle: () => ({ backgroundColor: "#fff" }),
    document: {
      body: {}, hasFocus: () => focused, createElement: () => canvas,
      addEventListener: documentEvents.addEventListener.bind(documentEvents),
      removeEventListener: documentEvents.removeEventListener.bind(documentEvents),
    },
    window: {
      devicePixelRatio: 1,
      setTimeout(callback: () => void) { timer = callback; return 1; },
      clearTimeout() { cleared++; timer = undefined; },
      addEventListener: events.addEventListener.bind(events),
      removeEventListener: events.removeEventListener.bind(events),
    },
  };
  for (const [key, value] of Object.entries(globals)) {
    const original = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { value, configurable: true });
    t.after(() => {
      if (original) Object.defineProperty(globalThis, key, original);
      else Reflect.deleteProperty(globalThis, key);
    });
  }
  return {
    el, blob, clipboard,
    renders: () => renders,
    cleared: () => cleared,
    setFocus(value: boolean) { focused = value; },
    focus() { focused = true; events.dispatchEvent(new Event("focus")); },
    timeout() { assert.ok(timer); timer(); },
  };
}

test("desktop/mobile: clipboard write starts in the click before PNG rendering", async (t) => {
  const s = setup(t);
  let writes = 0;
  s.clipboard.write = async (items) => {
    writes++;
    assert.equal(s.renders(), 0);
    assert.equal(await items[0].data["image/png"], s.blob);
  };
  const result = copyElementScreenshotToClipboard(s.el);
  assert.equal(writes, 1);
  await result;
  assert.equal(s.renders(), 1);
});

test("temporary focus loss retries once with the same image after focus returns", async (t) => {
  const s = setup(t);
  let writes = 0;
  let first: unknown;
  s.clipboard.write = async (items) => {
    writes++;
    if (writes === 1) {
      first = items[0];
      s.setFocus(false);
      throw new DOMException("Document is not focused.", "NotAllowedError");
    }
    assert.equal(items[0], first);
    assert.equal(await items[0].data["image/png"], s.blob);
  };
  const result = copyElementScreenshotToClipboard(s.el);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(writes, 1);
  s.focus();
  await result;
  assert.equal(writes, 2);
  assert.equal(s.renders(), 1);
  assert.equal(s.cleared(), 1);
});

test("initially unfocused page waits before writing", async (t) => {
  const s = setup(t);
  s.setFocus(false);
  let writes = 0;
  s.clipboard.write = async (items) => { writes++; await items[0].data["image/png"]; };
  const result = copyElementScreenshotToClipboard(s.el);
  assert.equal(writes, 0);
  s.focus();
  await result;
  assert.equal(writes, 1);
});

test("focus timeout stops and gives a Chinese retry instruction", async (t) => {
  const s = setup(t);
  s.setFocus(false);
  let writes = 0;
  s.clipboard.write = async () => { writes++; };
  const result = copyElementScreenshotToClipboard(s.el);
  s.timeout();
  await assert.rejects(result, /页面未获得焦点.*再次点击截图/);
  s.focus();
  assert.equal(writes, 0);
  assert.equal(s.cleared(), 1);
});

test("permission denial is not retried and uses the exception name", async (t) => {
  const s = setup(t);
  let writes = 0;
  s.clipboard.write = async () => { writes++; throw new DOMException("Write permission denied.", "NotAllowedError"); };
  await assert.rejects(copyElementScreenshotToClipboard(s.el), /允许剪贴板权限/);
  assert.equal(writes, 1);
});

test("repeated focus errors stop after one retry", async (t) => {
  const s = setup(t);
  let writes = 0;
  s.clipboard.write = async () => { writes++; throw new DOMException("Document is not focused.", "NotAllowedError"); };
  await assert.rejects(copyElementScreenshotToClipboard(s.el), /页面未获得焦点/);
  assert.equal(writes, 2);
});

test("PNG generation errors reject without an unhandled promise", async (t) => {
  const s = setup(t);
  s.el.getBoundingClientRect = () => ({ width: 0, height: 0 }) as DOMRect;
  await assert.rejects(copyElementScreenshotToClipboard(s.el), /图表区域尚未就绪/);
});
