// Isolated real-component browser checks; fixed events and a store stub, no production API or DB.
// Requires Playwright and Chromium in the verification environment. Run from the repository root.
const {build}=require('esbuild');
const fs=require('fs');
const postcss=require('postcss');
const tailwind=require('@tailwindcss/postcss');
const http=require('http');
const {chromium}=require('playwright');
const assert=require('assert/strict');
(async()=>{
const root=require('path').resolve(__dirname,'../..');
const artifactDir=fs.mkdtempSync(require('path').join(require('os').tmpdir(),'event-filter-browser-'));
const built=await build({stdin:{contents:`
import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {MarketsEventShelf} from '@/components/equity/MarketsEventShelf';
import {sanitizeEventViewFilters, updateEventSourceFilters, clearEventContentFilters} from '@/lib/chart/eventViewFilters';
import {selectChartEvents} from '@/lib/chart/eventSelection';
import {useChartEvents} from '@/lib/chart/useChartEvents';
import {parseMilestoneIngestJson} from '@/lib/equity/companyMilestones';
const event=(id,title,sourceKind,eventType='company.product')=>({id,externalId:id,title,content:title,occurredAt:'2026-10-14T12:00:00Z',datePrecision:'DATETIME',importance:'HIGH',eventType,scope:'COMPANY',countries:['US'],industries:['45'],assets:['AAPL'],persons:[],institutions:[],macroKeys:[],tags:[],payload:{},markerLabel:title,sourceKind,sourceUrl:'https://example.com/'+id,isPublic:true,createdById:'test',createdAt:'',updatedAt:''});
function App(){
const [state,setState]=useState(()=>sanitizeEventViewFilters({}));
const [simulatedError,setSimulatedError]=useState(location.search.includes('error'));
const [locals,setLocals]=useState([event('u','用户产品样例','user_local'),{...event('local:s','用户系统产品注释','user_local'),externalId:'s'}]);
const [selected,setSelected]=useState(null);
window.testState=state;window.updateFilters=setState;
const result={...selectChartEvents(locals,simulatedError?[]:[event('s','系统产品样例','ai_skill'),event('m','宏观样例','ai_skill','macro.release')],state,'2026-01-01','2026-12-31'),loading:false,error:simulatedError?"fixture unavailable":null,from:"2026-01-01",to:"2026-12-31",retry:()=>setSimulatedError(false)};
window.testResult=result;
const store={events:[],allAssetEvents:[],allAssetCount:0,packs:[],ready:true,importEvents:()=>setLocals([...locals,event('new','新导入产品','user_local')]),updatePack:()=>{},deletePack:()=>{},clearAllAssets:()=>{}};
return <main><MarketsEventShelf localEventStore={store} eventResult={result} selectedEventId={selected} markerGroupIds={[]} onCloseMarkerGroup={()=>{}} onSelectEvent={setSelected} onLocateEvent={()=>{}} symbol='AAPL' viewFilters={state} onViewFiltersChange={setState} onResetToSymbolDefault={source=>setState(updateEventSourceFilters(state,source,{...clearEventContentFilters(state),minImportance:'MEDIUM'}))}/></main>;
}
function LiveQueryHarness(){
const [filters,setFilters]=useState(()=>sanitizeEventViewFilters({}));
const [symbol,setSymbol]=useState('AAPL');
const local=React.useMemo(()=>parseMilestoneIngestJson({events:[event('u','用户事件','user_local')]}).milestones,[]);
const result=useChartEvents(symbol,local,filters,Date.parse('2026-01-01')/1000,Date.parse('2026-12-31')/1000);
window.liveResult=result;
return <div><button onClick={result.retry}>retry</button><button onClick={()=>setFilters({...filters,includeMarket:false,includeSec:false})}>disable sources</button><button onClick={()=>setSymbol('TSLA')}>switch symbol</button><span>{result.loading?'loading':result.error?'error':'ready'}</span></div>;
}
createRoot(document.getElementById('root')).render(location.search.includes('live')?<LiveQueryHarness/>:<App/>);
`,resolveDir:root,loader:'tsx'},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',tsconfig:root+'/tsconfig.json',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'no-database',setup(b){b.onResolve({filter:/^@\/lib\/prisma$/},()=>({path:'prisma',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export const prisma = {};'}));}}]});
const css=await postcss([tailwind({base:root})]).process(fs.readFileSync(root+'/src/app/globals.css','utf8'),{from:root+'/src/app/globals.css'});
let queryMode='paging';
const requests=[];
const responseEvent=(id,kind)=>({id,externalId:id,title:id,content:'Evidence',occurredAt:'2026-10-14T12:00:00Z',datePrecision:'DATETIME',importance:'HIGH',eventType:'company.product',scope:'COMPANY',countries:['US'],industries:['45'],assets:['AAPL'],persons:[],institutions:[],macroKeys:[],tags:[],payload:{},markerLabel:id,sourceKind:kind,sourceUrl:'https://example.com/'+id,isPublic:true,createdById:'test',createdAt:'',updatedAt:''});
const server=http.createServer((req,res)=>{
if(req.url.startsWith('/api/events/for-chart')){
  const params=new URL(req.url,'http://localhost').searchParams;
  requests.push(req.url);
  res.setHeader('Content-Type','application/json');
  if(queryMode==='error'){res.statusCode=503;res.end(JSON.stringify({error:'fixture unavailable'}));return;}
  const reply=()=>res.end(JSON.stringify(Number(params.get('offset'))===0?{events:[responseEvent('s','ai_skill'),responseEvent('sec','sec')],hasMore:true}:{events:[responseEvent('sec','sec'),responseEvent('b','ai_skill')],hasMore:false}));
  if(queryMode==='slow')setTimeout(reply,300);else reply();
  return;
}
res.setHeader('Content-Type',req.url==='/app.js'?'application/javascript':'text/html');
res.end(req.url==='/app.js'?built.outputFiles[0].text:`<!doctype html><html><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css.css}</style><div id="root"></div><script src="/app.js"></script></html>`);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const executablePath=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
const browser=await chromium.launch({executablePath,headless:true,args:['--no-sandbox']});
try{
for(const width of [1280,390,320]){
const page=await browser.newPage({viewport:{width,height:844}}); const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:'+server.address().port);await page.getByRole('tab',{name:/系统事件/}).waitFor();
const shelf=page.locator('section[aria-label="事件筛选器"]');
assert.equal(Math.round((await shelf.boundingBox()).height),180);
await shelf.screenshot({path:artifactDir+'/initial-'+width+'.png'});
const cardHeight=await page.locator('[data-event-id="s"]').evaluate(el=>el.getBoundingClientRect().height);
assert.ok(cardHeight<=80, 'compact event card must fit within 80px');
assert.equal(await page.evaluate(()=>window.testResult.sourceEvents.system.length),2);
assert.equal(await page.evaluate(()=>window.testResult.sourceEvents.user.length),2);
assert.equal(await page.evaluate(()=>window.testResult.sourceStats.system.merged),1);
await page.evaluate(()=>window.updateFilters(prev=>({...prev,hiddenEventIds:['s']})));
await page.getByRole('button',{name:/结果说明/}).click();
await page.getByRole('button',{name:'恢复本类隐藏事件',exact:true}).click();
assert.equal(await page.evaluate(()=>window.testResult.sourceEvents.system.length),2);
await page.getByRole('button',{name:'关闭',exact:true}).click();
await page.getByRole('button',{name:'说明：系统产品样例',exact:true}).click();
const explanation=page.getByRole('dialog',{name:'事件结果说明'});
await explanation.screenshot({path:artifactDir+'/diagnostics-'+width+'.png'});
assert.equal(await explanation.getByRole('region',{name:'当前事件说明'}).getByText('图表状态：同一事实已合并到其他记录',{exact:true}).isVisible(),true);
assert.equal(Math.round((await shelf.boundingBox()).height),180);
await explanation.getByRole('button',{name:/用户 · 用户系统产品注释/}).first().click();
assert.equal(await page.getByRole('tab',{name:/用户事件/}).getAttribute('aria-selected'),'true');
await page.getByRole('checkbox',{name:'本类上图',exact:true}).uncheck();
assert.equal(await page.evaluate(()=>window.testResult.chartEvents.some(e=>e.id==='s')),true);
await page.getByRole('tab',{name:/系统事件/}).click();
assert.equal(await page.getByRole('button',{name:'系统产品样例',exact:false}).count()>0,true);
await page.getByRole('checkbox',{name:'本类上图',exact:true}).uncheck();
assert.equal(await page.getByRole('button',{name:'系统产品样例',exact:false}).count()>0,true);
assert.equal(await page.evaluate(()=>window.testState.markersEnabled),false);
if(width<640){
await page.getByRole('button',{name:'筛选条件',exact:true}).click();
await page.getByRole('dialog').getByRole('searchbox').fill('不匹配');
assert.equal(await page.evaluate(()=>window.testState.searchQ),'');
await page.getByRole('button',{name:'取消',exact:true}).click();
assert.equal(await page.evaluate(()=>window.testState.searchQ),'');
assert.equal(await page.getByRole('button',{name:'筛选条件',exact:true}).evaluate(el=>document.activeElement===el),true);
await page.getByRole('button',{name:'筛选条件',exact:true}).click();
await page.getByRole('dialog').getByRole('searchbox').fill('系统产品');
await page.screenshot({path:artifactDir+'/sheet-'+width+'.png',fullPage:true});
await page.getByRole('button',{name:'应用筛选',exact:true}).click();
}else{await page.getByRole('searchbox').fill('系统产品');}
assert.equal(await page.evaluate(()=>window.testState.searchQ),'系统产品');
await page.getByRole('tab',{name:/用户事件/}).click();
assert.equal(await page.evaluate(()=>window.testState.userFilters.searchQ),'');
await page.getByRole('button',{name:'清除内容条件',exact:true}).click();
assert.equal(await page.evaluate(()=>window.testState.userFilters.minImportance),'LOW');
assert.equal(await page.evaluate(()=>window.testState.searchQ),'系统产品');
await page.getByRole('button',{name:'用户事件包管理',exact:true}).click();
assert.equal(await page.getByRole('link',{name:'下载 SKILL'}).isVisible(),true);
assert.equal(await page.getByRole('combobox',{name:'本地事件导入范围'}).isVisible(),true);
assert.equal(Math.round((await shelf.boundingBox()).height),180);
await page.getByRole('button',{name:'关闭',exact:true}).click();
await page.getByRole('tab',{name:/系统事件/}).click();
await page.getByRole('button',{name:'清除内容条件',exact:true}).click();
assert.equal(await page.evaluate(()=>window.testState.markersEnabled),false);
if(width<640) await page.getByRole('button',{name:'筛选条件',exact:true}).click();
const scope=width<640?page.getByRole('dialog'):page;
await scope.getByRole('button',{name:/类型：/}).click();
assert.equal(Math.round((await shelf.boundingBox()).height),180);
await scope.getByRole('button',{name:'清空类型',exact:true}).click();
if(width<640) await page.getByRole('button',{name:'应用筛选',exact:true}).click();
assert.deepEqual(await page.evaluate(()=>window.testState.typeFamilies),[]);
await page.getByRole('button',{name:'查看排除原因',exact:true}).click();
assert.equal(await page.getByRole('dialog',{name:'事件结果说明'}).getByText('类型未选中：2',{exact:true}).isVisible(),true);
assert.equal(Math.round((await shelf.boundingBox()).height),180);
await page.getByRole('button',{name:'关闭',exact:true}).click();
assert.equal(await page.getByRole('button',{name:/移除类型：未选/}).isVisible(),true);
await page.getByRole('button',{name:/移除类型：未选/}).click();
assert.equal(await page.evaluate(()=>window.testState.typeFamilies.length>0),true);
if(width<640) await page.getByRole('button',{name:'筛选条件',exact:true}).click();
await scope.getByRole('button',{name:/更多筛选/}).click();
assert.equal(Math.round((await shelf.boundingBox()).height),180);
assert.equal(await scope.getByText('宏观专属条件',{exact:true}).isVisible(),true);
await scope.getByRole('checkbox',{name:'仅宏观大预期差',exact:true}).check();
if(width<640) await page.getByRole('button',{name:'应用筛选',exact:true}).click();
await page.getByRole('button',{name:'移除仅宏观大预期差'}).click();
assert.equal(await page.evaluate(()=>window.testState.largeSurpriseOnly),false);
assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
assert.deepEqual(errors,[]);
await page.screenshot({path:artifactDir+'/result-'+width+'.png',fullPage:true});
console.log('PASS viewport '+width+': source isolation, content reset, list retention, type summary, macro condition, mobile draft/apply, source management, no horizontal overflow');
await page.close();
}
const failed=await browser.newPage({viewport:{width:390,height:844}});
await failed.goto('http://127.0.0.1:'+server.address().port+'/?error');
await failed.getByRole('button',{name:'加载失败 · 结果说明',exact:true}).waitFor();
assert.equal(await failed.getByRole('status').getByText('系统事件加载失败，不能据此判断没有事件。用户事件仍可查看。',{exact:true}).isVisible(),true);
await failed.getByRole('tab',{name:/用户事件/}).click();
assert.equal(await failed.getByRole('button',{name:'说明：用户产品样例',exact:true}).count(),1);
await failed.getByRole('tab',{name:/系统事件/}).click();
await failed.getByRole('button',{name:'重试加载',exact:true}).first().click();
await failed.waitForFunction(()=>window.testResult.sourceEvents.system.length===2);
await failed.close();
console.log('PASS failure UI: failure is not reported as no events; user list remains available; retry recovers');
const live=await browser.newPage();
const liveErrors=[];live.on('pageerror',e=>liveErrors.push(e.message));
queryMode='error';
await live.goto('http://127.0.0.1:'+server.address().port+'/?live');
await live.waitForFunction(()=>Boolean(window.liveResult?.error));
assert.equal(await live.evaluate(()=>window.liveResult.sourceEvents.user.length),1);
assert.equal(await live.evaluate(()=>window.liveResult.sourceEvents.system.length),0);
queryMode='paging';
await live.getByRole('button',{name:'retry',exact:true}).click();
await live.waitForFunction(()=>!window.liveResult.loading&&!window.liveResult.error&&window.liveResult.sourceStats.system.loaded===3);
assert.equal(await live.evaluate(()=>window.liveResult.sourceEvents.system.length),3);
assert.equal(await live.evaluate(()=>window.liveResult.events.length),4);
const requestsBefore=requests.length;
await live.getByRole('button',{name:'disable sources',exact:true}).click();
await live.waitForFunction(()=>window.liveResult.sourceStats.system.reasons.source===3);
assert.equal(requests.length,requestsBefore,'source switches must not trigger a new candidate request');
assert.equal(await live.evaluate(()=>window.liveResult.sourceEvents.user.length),1);
queryMode='slow';
await live.getByRole('button',{name:'switch symbol',exact:true}).click();
assert.equal(await live.evaluate(()=>window.liveResult.loading),true);
assert.equal(await live.evaluate(()=>window.liveResult.sourceStats.system.loaded),0,'the previous symbol must not leak into the next query');
await live.waitForFunction(()=>!window.liveResult.loading&&window.liveResult.sourceStats.system.loaded===3);
assert.deepEqual(liveErrors,[]);
await live.close();
console.log('PASS live useChartEvents: load failure preserves user records; retry; repeated SEC pagination IDs; source switches reuse candidates; symbol changes clear stale results');
console.log('Screenshots: '+artifactDir);
}finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1)});
