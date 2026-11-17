// Read-only audit: native observations and schedules for the consumer-pressure basket.
require('@next/env').loadEnvConfig(process.cwd());
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const rows = await prisma.instrument.findMany({
    where: { OR: [
      { fredSeriesId: { in: ['DSPIC96','PCEC96','PSAVERT','TDSP','REVOLSL','DRCCLACBS'] } },
      { name: { contains: '信用卡' } }, { name: { contains: '流动性资产' } },
      { name: { contains: '汽车贷款' } }, { code: { startsWith: 'nyfed_hhdc_' } },
      { fredSeriesId: { startsWith: 'BOGZ1FL15' } },
      { fredSeriesId: { startsWith: 'RCCCB' } },
    ] }, orderBy: { code: 'asc' },
  });
  for (const r of rows) {
    const [sub, count, first, last] = await Promise.all([
      prisma.dataSubscription.findUnique({where:{instrumentId:r.id}}),
      prisma.macroObservation.count({where:{instrumentId:r.id}}),
      prisma.macroObservation.findFirst({where:{instrumentId:r.id},orderBy:{obsDate:'asc'},select:{obsDate:true}}),
      prisma.macroObservation.findFirst({where:{instrumentId:r.id},orderBy:{obsDate:'desc'},select:{obsDate:true,value:true}}),
    ]);
    console.log(JSON.stringify({code:r.code,name:r.name,fredId:r.fredSeriesId,unit:r.unit,count,first,last,category:r.metadata?.catalogCategory,subscription:sub && {enabled:sub.enabled,source:sub.sourceId,rule:sub.releaseRule,package:sub.releasePackageId,nextRunAt:sub.nextRunAt,lastSuccessAt:sub.lastSuccessAt}}));
  }
}
main().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>prisma.$disconnect());
