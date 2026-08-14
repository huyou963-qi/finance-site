import fs from "node:fs";
import path from "node:path";
import { parseIsmOfficialCalendarPage, type IsmOfficialRelease } from "./parseCalendar";

/** 官网年历的仓库副本。ismworld.org 对自动化请求常返回 reCAPTCHA，worker 用此表调度。 */
export function loadPublishedIsmOfficialReleases(): IsmOfficialRelease[] {
  const file = path.join(__dirname, "fixtures", "calendar-2026.snippet.html");
  return parseIsmOfficialCalendarPage(fs.readFileSync(file, "utf8"));
}
