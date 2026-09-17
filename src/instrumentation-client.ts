/**
 * 旧内核浏览器兼容补丁：在任何前端业务代码执行前加载。
 *
 * Next.js 只给不支持 ES module 的浏览器注入 polyfill；像傲游 5（UA 自称 Safari 14.1、
 * 实际内核更旧）这类「支持模块、但缺 ES2019+ 内建方法」的浏览器拿不到补丁，
 * 会在 Promise.allSettled / Array.prototype.at 等处直接抛未捕获异常。
 *
 * 这里按需引入 core-js 的单项补丁（已原生支持时 core-js 不会覆盖），新代码可放心使用这些 API。
 */
import "core-js/actual/array/at";
import "core-js/actual/array/flat";
import "core-js/actual/array/flat-map";
import "core-js/actual/array/find-last";
import "core-js/actual/array/find-last-index";
import "core-js/actual/array/to-sorted";
import "core-js/actual/array/to-reversed";
import "core-js/actual/array/to-spliced";
import "core-js/actual/array/with";
import "core-js/actual/string/at";
import "core-js/actual/string/replace-all";
import "core-js/actual/string/trim-start";
import "core-js/actual/string/trim-end";
import "core-js/actual/object/from-entries";
import "core-js/actual/object/has-own";
import "core-js/actual/object/group-by";
import "core-js/actual/map/group-by";
import "core-js/actual/promise/all-settled";
import "core-js/actual/promise/any";
import "core-js/actual/promise/with-resolvers";
import "core-js/actual/global-this";
import "core-js/actual/structured-clone";

// AbortSignal.timeout 属于 Web API，core-js 不提供
if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout !== "function") {
  AbortSignal.timeout = (ms: number) => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(new DOMException("signal timed out", "TimeoutError")), ms);
    return controller.signal;
  };
}
