import fs from "node:fs";
import path from "node:path";

/** 从 Cursor 内置浏览器访问 investing.com 经济日历页时读取的 Cookie（含 PHPSESSID） */
const cookie =
  'gcc=NL; gsc=NH; udid=677f7db97af92364bab670fc0c5525db; inudid=677f7db97af92364bab670fc0c5525db; smd=677f7db97af92364bab670fc0c5525db-1781177645; invab=alladsnewd_1|chlngsurlb_1|collapsads_0|mobnataff_0|mobtnbfull_0|navbarcta_0|newhpa_2|ttfooter_1; fs_marker=1; user-browser-sessions=1; browser-session-counted=true; adBlockerNewUserDomains=1781177608; lifetime_page_view_count=1; g_state={"i_l":0,"i_ll":1781177609215,"i_b":"6nnSfxWBF5fx0abfTcwsgH5SARfaeD/s+TvrM4E5wWc","i_e":{"enable_itp_optimization":0},"i_et":1781177609215}; top_strip_variant=%7B%22user_type%22%3A%22guest%22%2C%22variant_id%22%3A1%2C%22variant_name%22%3A%22Free%20users%201%2C%20AI-picked%20X%20days%22%7D; ses_num=1; last_smd=677f7db97af92364bab670fc0c5525db-1781177645; _imntz_error=0; _hjSessionUser_174945=eyJpZCI6ImU2YWVmN2QxLTcxNzktNTYwNi04Njc0LWQzZTBlM2U5MmVmYiIsImNyZWF0ZWQiOjE3ODExNzc2MTQwODIsImV4aXN0aW5nIjpmYWxzZX0=; _hjSession_174945=eyJpZCI6ImVkZjdmNzE2LWFhOGYtNDlmZi04OTVkLWU4ZDJlN2E5OWY1OCIsImMiOjE3ODExNzc2MTQwODQsInMiOjAsInIiOjAsInNiIjowLCJzciI6MCwic2UiOjAsImZzIjoxLCJzcCI6MH0=; _hjHasCachedUserAttributes=true; mm-user-id=AsOqTQdC7UcohqXi; mm-session-id=zpmjjFFqWe7G2Mcj; mm_uds_uid2=mm_fp_99bd407b66eb20cd99bd407b66eb20cd; gc_session_id=edxpz9sxa98urt4yzu6m5m; gcid_first=9ffccfa5-ce90-4774-9ea7-8f7a636c6870; _pubcid=1a03d802-2c6b-44cc-8063-f281f1ec8e64; 33acrossIdTp=softonic.jp; PHPSESSID=8hce90m96hdbkhmuh684a827tl; _dd_s_v2=aid=960a74bb-0264-4105-8836-9e3bde7203c8&id=8d4adf90-97a9-40a6-a9c7-def768be6a0b&created=1781177608051&expire=1781178688058&c=0';

const root = process.cwd();
const dataDir = path.join(root, ".data");
fs.mkdirSync(dataDir, { recursive: true });
fs.writeFileSync(path.join(dataDir, "investing-cookie.txt"), cookie, "utf8");

const envPath = path.join(root, ".env.local");
let env = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
const line = `INVESTING_CALENDAR_COOKIE=${JSON.stringify(cookie)}`;
if (/^INVESTING_CALENDAR_COOKIE=/m.test(env)) {
  env = env.replace(/^INVESTING_CALENDAR_COOKIE=.*$/m, line);
} else {
  env += `\n# Investing.com 经济日历（npm run data:sync-calendar）\n${line}\n`;
}
if (!/INVESTING_CALENDAR_USER_AGENT=/m.test(env)) {
  env +=
    'INVESTING_CALENDAR_USER_AGENT=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36\n';
}
fs.writeFileSync(envPath, env, "utf8");
console.log("Wrote .data/investing-cookie.txt and updated .env.local INVESTING_CALENDAR_COOKIE");
