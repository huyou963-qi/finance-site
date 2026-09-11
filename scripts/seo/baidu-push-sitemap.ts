/**
 * 把 sitemap 全部 URL 推送到百度搜索资源平台（普通收录 · API 提交）。
 *
 *   npm run seo:baidu-push              # 实推
 *   npm run seo:baidu-push -- --dry-run # 只列出将推送的 URL
 *
 * 需要 .env.local：APP_BASE_URL（线上域名，与百度平台验证的站点一致）、BAIDU_PUSH_TOKEN。
 */
import { prisma } from "../../src/lib/prisma";
import { pushUrlsToBaidu } from "../../src/lib/seo/baiduPush";
import { getSiteUrl } from "../../src/lib/seo/siteUrl";
import { collectSitemapEntries } from "../../src/lib/seo/sitemapEntries";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const urls = (await collectSitemapEntries()).map((e) => e.url);
  console.log(`[baidu-push] site=${getSiteUrl()} urls=${urls.length}`);

  if (dryRun) {
    console.log(urls.join("\n"));
    return;
  }

  const result = await pushUrlsToBaidu(urls);
  if (!result) {
    console.error("[baidu-push] 跳过：未配置 BAIDU_PUSH_TOKEN，或 APP_BASE_URL 仍是 localhost");
    process.exitCode = 1;
    return;
  }
  console.log(
    `[baidu-push] success=${result.success} remain=${result.remain ?? "?"} ` +
      `not_same_site=${result.notSameSite.length} not_valid=${result.notValid.length}`,
  );
  if (result.notSameSite.length) console.log("not_same_site:", result.notSameSite.slice(0, 10));
  if (result.notValid.length) console.log("not_valid:", result.notValid.slice(0, 10));
  if (result.errors.length) {
    console.error("[baidu-push] errors:", result.errors);
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
