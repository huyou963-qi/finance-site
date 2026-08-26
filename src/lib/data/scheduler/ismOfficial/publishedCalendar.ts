import { parseIsmOfficialCalendarPage, type IsmOfficialRelease } from "./parseCalendar";

// Keep the production fallback in the server bundle. Next.js relocates compiled modules
// under .next/server/chunks, so reading a sibling fixture via __dirname fails after deploy.
const PUBLISHED_ISM_OFFICIAL_CALENDAR_2026_HTML = `
<table>
  <thead><tr><th>Month</th><th>Manufacturing PMI®</th><th>Services PMI®</th></tr></thead>
  <tbody>
    <tr><td>January 2026</td><td>5</td><td>7</td></tr>
    <tr><td>February 2026</td><td>2</td><td>4</td></tr>
    <tr><td>March 2026</td><td>2</td><td>4</td></tr>
    <tr><td>April 2026</td><td>1</td><td>6</td></tr>
    <tr><td>May 2026</td><td>1</td><td>5</td></tr>
    <tr><td>June 2026</td><td>1</td><td>3</td></tr>
    <tr><td>July 2026</td><td>1</td><td>6**</td></tr>
    <tr><td>August 2026</td><td>3</td><td>5</td></tr>
    <tr><td>September 2026</td><td>1</td><td>3</td></tr>
    <tr><td>October 2026</td><td>1</td><td>5</td></tr>
    <tr><td>November 2026</td><td>2</td><td>4</td></tr>
    <tr><td>December 2026</td><td>1</td><td>3</td></tr>
  </tbody>
</table>`;

/** 官网年历的仓库副本。ismworld.org 对自动化请求常返回 reCAPTCHA，worker 用此表调度。 */
export function loadPublishedIsmOfficialReleases(): IsmOfficialRelease[] {
  return parseIsmOfficialCalendarPage(PUBLISHED_ISM_OFFICIAL_CALENDAR_2026_HTML);
}
