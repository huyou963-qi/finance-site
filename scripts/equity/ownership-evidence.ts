/** Export/import the append-only ownership evidence ledger. Local operator command, no remote messaging. */
import {readFile,writeFile} from 'node:fs/promises';
import {isDeepStrictEqual} from 'node:util';
import {prisma} from '../../src/lib/prisma';
import {appendOwnershipReview} from '../../src/lib/equity/ownershipReviews';
import {validateReviewInput} from '../../src/lib/equity/ownershipReviewValidation';
const arg=(key:string)=>process.argv.find(v=>v.startsWith(`${key}=`))?.slice(key.length+1);
async function main(){
 const symbol=arg('--symbol')?.toUpperCase();const out=arg('--export'),input=arg('--import');
 if(out){if(!symbol||!/^[A-Z0-9.\-]{1,16}$/.test(symbol))throw new Error('--symbol required');const rows=await prisma.ownershipReview.findMany({where:{symbol},orderBy:[{key:'asc'},{revision:'asc'}]});await writeFile(out,JSON.stringify(rows.map(r=>({symbol:r.symbol,key:r.key,expectedRevision:r.revision-1,payload:r.payload,sourceUrl:r.sourceUrl,quote:r.quote,availableAt:r.availableAt.toISOString().slice(0,10)})),null,2));console.log(`Exported ${rows.length} evidence versions.`);return;}
 if(!input)throw new Error('Use --export=path --symbol=CRWV or --import=path [--apply]');
 const values=JSON.parse(await readFile(input,'utf8'));if(!Array.isArray(values)||values.length>10000)throw new Error('Expected <=10000 evidence entries');
 const entries=values.map(validateReviewInput);console.log(`Validated ${entries.length} evidence entries.`);
 if(!process.argv.includes('--apply'))return;
 for(const entry of entries){const existing=await prisma.ownershipReview.findUnique({where:{symbol_key_revision:{symbol:entry.symbol,key:entry.key,revision:entry.expectedRevision+1}}});
  if(existing){const payload=entry.payload.kind==='plan'?{...entry.payload,plan:{...entry.payload.plan,verified:true,sourceUrl:entry.sourceUrl,evidence:entry.quote}}:entry.payload;
   if(!isDeepStrictEqual(existing.payload,payload)||existing.sourceUrl!==entry.sourceUrl||existing.quote!==entry.quote||existing.availableAt.toISOString().slice(0,10)!==entry.availableAt)throw new Error(`Conflicting existing evidence: ${entry.key}`);continue;}
  await appendOwnershipReview(entry,arg('--author')||'local operator');
 }
 console.log('Evidence imported (idempotent).');
}
main().catch(e=>{console.error(e instanceof Error?e.message:e);process.exitCode=1;}).finally(()=>prisma.$disconnect());
