import { prisma } from "../src/lib/prisma";

async function main() {
  const rows = await prisma.userBookmarkState.findMany();
  console.log("UserBookmarkState ok, rows:", rows.length);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
