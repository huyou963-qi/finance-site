# 如何获取 INVESTING_CALENDAR_COOKIE

Investing 经济日历 API 对 **Node.js 脚本** 有 Cloudflare 防护：只复制 `document.cookie` 往往不够，还需要浏览器里 **HttpOnly** 的 Cookie（如 `cf_clearance`、`PHPSESSID`）。

## 方法一（推荐）：Chrome / Edge 开发者工具 → Application

1. 用 **Chrome 或 Edge**（不要用 IDE 内置浏览器）打开：  
   https://www.investing.com/economic-calendar/
2. 若出现人机验证，先完成验证，确保日历表格能正常显示。
3. `F12` → **Application（应用程序）** → 左侧 **Cookies** → 选中 `https://www.investing.com`
4. 在右侧列表中，重点确认存在（名称可能略有不同）：
   - `PHPSESSID`
   - `cf_clearance`（若经过 Cloudflare 验证）
   - `udid` / `inudid`
5. 用扩展 **[Cookie-Editor](https://cookie-editor.com/)** 或类似工具：
   - Export → **Header String**（一整行 `name=value; name2=value2`）
6. 粘贴到 `.env.local`：

```env
INVESTING_CALENDAR_COOKIE="这里粘贴整行 Cookie"
INVESTING_CALENDAR_USER_AGENT=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36
```

整行值建议用 **双引号** 包起来（dotenv 可正确处理其中的 `;` 和 `=`）。

7. 验证：

```powershell
npm run data:sync-calendar
```

成功时应看到类似 **「x/45 条日历订阅已对齐」**，而不是「日历拉取失败 / 403」。

---

## 方法二：Network 里找请求（你之前搜不到的原因）

新版日历页 **首次打开不一定会发 XHR**，需要先点顶部日期按钮触发请求：

1. 打开 https://www.investing.com/economic-calendar/
2. `F12` → **Network**，勾选 **Preserve log**
3. 点击 **This Week**、**Show Filters** 或切换 **Today / Tomorrow**
4. 在过滤框输入（任选其一，不要只搜 `FilteredData`）：
   - `getCalendarFilteredData`
   - 或 `Service`
   - 或 `economic-calendar`
5. 选中请求，完整 URL 类似：  
   `https://www.investing.com/economic-calendar/Service/getCalendarFilteredData`
6. **Request Headers** → 复制 **Cookie:** 后面的整段（不要带 `Cookie:` 前缀）

---

## 方法三：在 Chrome 控制台一键复制（仅非 HttpOnly，可能仍 403）

在日历页 Console 粘贴运行：

```javascript
copy(document.cookie);
console.log("已复制 document.cookie 到剪贴板（不含 HttpOnly，Node 可能仍 403）");
```

若 `sync-calendar` 仍 403，请改用法一。

---

## 本项目已写入的 Cookie

Agent 曾从 IDE 浏览器读取 Cookie 并写入：

- `.env.local` → `INVESTING_CALENDAR_COOKIE=...`
- `.data/investing-cookie.txt`（备份）

**在本机 Node 测试仍可能 403**（Cloudflare 识别非浏览器 TLS）。请在你自己的 **Chrome** 里按方法一重新导出 Cookie 覆盖 `.env.local`。

---

## Cookie 过期

Cookie 通常 **数小时～数天** 失效。再次出现 403 或「日历拉取失败」时，重复方法一重新复制即可。

勿将 Cookie 提交到 Git。
