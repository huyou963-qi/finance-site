import { prisma } from "../../src/lib/prisma";
import { syncRegimeMacroVintages } from "../../src/lib/data/macroObservationVintages";

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((item) => item.startsWith(prefix))?.slice(prefix.length);
}

async function main() {
  const result = await syncRegimeMacroVintages({
    realtimeStart: arg("start"),
    realtimeEnd: arg("end"),
  });
  console.log(`ALFRED vintage ${result.realtimeStart} → ${result.realtimeEnd}`);
  for (const row of result.series) {
    console.log(
      `${row.seriesId.padEnd(10)} fetched=${String(row.fetchedRows).padStart(6)} parsed=${String(row.parsedVintages).padStart(6)} inserted=${String(row.insertedVintages).padStart(6)}`,
    );
  }
  console.log(`inserted total=${result.insertedVintages}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
