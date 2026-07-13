/**
 * 部署守卫：断言 mds.equity_security 已播种。
 * 空表会让每个 /equity/stocks/[symbol] 页面 notFound() → 404（历史事故：Wikipedia 源在
 * 中国大陆服务器被墙、seed 静默失败）。此脚本让"空表"在部署时显式失败，而非被绿灯掩盖。
 *
 * Usage: npm run equity:assert-seeded   （非零退出即部署失败）
 */
import { prisma } from "../../src/lib/prisma";

const MIN_ROWS = 400;

async function main() {
  const count = await prisma.equitySecurity.count();
  if (count < MIN_ROWS) {
    console.error(
      `[assert-seeded] equity_security 仅 ${count} 行（期望 ≥${MIN_ROWS}）。` +
        `S&P500 未正确播种——个股页会 404。请检查 equity:seed-sp500 是否执行成功。`,
    );
    process.exitCode = 1;
    return;
  }
  console.log(`[assert-seeded] OK：equity_security ${count} 行`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
