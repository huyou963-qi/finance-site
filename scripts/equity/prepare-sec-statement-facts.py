import argparse,json,datetime,collections,hashlib
from pathlib import Path
parser=argparse.ArgumentParser(description="关联companyfacts真实期间，不猜测日期，输出逐公司补充事实")
parser.add_argument('--workspace',required=True)
args=parser.parse_args();b=Path(args.workspace);cache=b/'facts';root=b/'archives';dest=b/'supplements';dest.mkdir(exist_ok=True)
config=json.loads((b/'policy.json').read_text());securities=json.loads((b/'securities.json').read_text(encoding='utf8'))
by_symbol={r['symbol']:r for r in securities if r.get('cik')};records=collections.defaultdict(dict);skipped=collections.Counter();metadata={};own_metadata={}
# 仅为真正消费的财务科目建立精确匹配索引，避免把整份companyfacts复制进内存。
own_tags={'NetIncomeLoss','ProfitLoss','NetIncomeLossAttributableToNoncontrollingInterest','Revenues','RevenueFromContractWithCustomerExcludingAssessedTax','RevenueFromContractWithCustomerIncludingAssessedTax','RevenuesNetOfInterestExpense','RegulatedAndUnregulatedOperatingRevenue','SalesRevenueNet','ExciseAndSalesTaxes','RevenuesExcludingInterestAndDividends','RealEstateRevenueNet','RevenueMineralSales','RefiningAndMarketingRevenue','NetCashProvidedByUsedInOperatingActivities','NetCashProvidedByUsedInOperatingActivitiesContinuingOperations','CashProvidedByUsedInOperatingActivitiesDiscontinuedOperations','PaymentsToAcquirePropertyPlantAndEquipment','PaymentsToAcquireProductiveAssets','PaymentsForCapitalImprovements'}
for roles in config['capex'].values():own_tags.update(tag for role in roles for tag in role)
for tags in config['legacy'].values():own_tags.update(tag.split(':')[1] for tag in tags)
for tags in config.get('extra',{}).values():own_tags.update(tags)

def iso(s):return s[:4]+'-'+s[4:6]+'-'+s[6:8]
def duration_q(start,end):
 days=(datetime.date.fromisoformat(end)-datetime.date.fromisoformat(start)).days
 for q,lo,hi in [(1,69,125),(2,140,205),(3,230,300),(4,330,380)]:
  if lo<=days<=hi:return q
 return None
def rounded_end(value):
 d=datetime.date.fromisoformat(value);next_month=d.replace(day=28)+datetime.timedelta(days=4)
 this_end=next_month.replace(day=1)-datetime.timedelta(days=1);previous_end=d.replace(day=1)-datetime.timedelta(days=1)
 return min([previous_end,this_end],key=lambda e:abs((e-d).days)).isoformat()

def starts(symbol):
 if symbol in metadata:return metadata[symbol]
 files=[cache/(symbol+'.json')]+[cache/('CIK'+str(r['predecessor'])+'.json') for r in config['predecessors'] if r['current']==int(by_symbol[symbol]['cik'])]
 m={};priority={};own={}
 for chosen in files:
  if not chosen.exists():continue
  f=json.loads(chosen.read_text(encoding='utf8'))
  for ns,concepts in f.get('facts',{}).items():
   for tag,c in concepts.items():
    pr=0 if tag in ['NetCashProvidedByUsedInOperatingActivities','NetCashProvidedByUsedInOperatingActivitiesContinuingOperations'] else 1 if tag in ['NetIncomeLoss','ProfitLoss','NetIncomeLossAvailableToCommonStockholdersBasic','Revenues','RevenueFromContractWithCustomerExcludingAssessedTax','RevenueFromContractWithCustomerIncludingAssessedTax'] else 2
    for p in c.get('units',{}).get('USD',[]):
     if not all(p.get(k) for k in ['start','end','accn','filed']):continue
     q=duration_q(p['start'],p['end'])
     if not q:continue
     key=(p['accn'],p['filed'],rounded_end(p['end']),q)
     if tag in own_tags and type(p.get('val')) in [int,float]:
      own.setdefault((p['accn'],p['filed'],'standard' if ns=='us-gaap' else 'custom',tag,rounded_end(p['end']),q,float(p['val'])),set()).add((p['start'],p['end']))
     if key not in priority or pr<priority[key]:priority[key]=pr;m[key]={(p['start'],p['end'])}
     elif pr==priority[key]:m[key].add((p['start'],p['end']))
 own_metadata[symbol]=own;metadata[symbol]=m;return m
for path in sorted(root.glob('*.statements.jsonl'),reverse=True):
 manifest=root/(path.name.split('.')[0]+'.manifest.json')
 if not manifest.exists() or json.loads(manifest.read_text()).get('version')!=4:continue
 policy_hash=hashlib.sha256((b/'policy.json').read_bytes()+(b/'securities.json').read_bytes()).hexdigest()
 if json.loads(manifest.read_text()).get('policyHash')!=policy_hash:raise ValueError('扫描策略已变更，请重新扫描归档')
 sha=json.loads(manifest.read_text())['sha256']
 for line in path.open(encoding='utf8'):
  r=json.loads(line);symbol=r['symbol']
  if symbol not in by_symbol:continue
  current=int(by_symbol[symbol]['cik']);cik=int(r['cik'])
  end=iso(r['end']);filed=iso(r['filed'])
  if not '2015-01-01'<=end<='2026-09-30':continue
  roles=config['capex'].get(str(current)) or [[s.split(':')[1]] for s in config['legacy'].get(str(current),[])] or [['PaymentsToAcquirePropertyPlantAndEquipment','PaymentsToAcquireProductiveAssets','PaymentsForCapitalImprovements']]
  capex_tags={s for role in roles for s in role}|set(config.get('extra',{}).get(str(current),[]))
  candidates=[p for p in r['presentation'] if (p['stmt']=='CF' and (r['tag'] in capex_tags or r['tag'] in ['NetCashProvidedByUsedInOperatingActivities','NetCashProvidedByUsedInOperatingActivitiesContinuingOperations','CashProvidedByUsedInOperatingActivitiesDiscontinuedOperations'])) or (p['stmt']=='IS' and (r['tag'] in ['NetIncomeLoss','ProfitLoss','NetIncomeLossAttributableToNoncontrollingInterest','Revenues','RevenueFromContractWithCustomerExcludingAssessedTax','RevenueFromContractWithCustomerIncludingAssessedTax','RevenuesNetOfInterestExpense','RegulatedAndUnregulatedOperatingRevenue','SalesRevenueNet','ExciseAndSalesTaxes','RevenuesExcludingInterestAndDividends','RealEstateRevenueNet','RevenueMineralSales','RefiningAndMarketingRevenue']))]
  candidates=[p for p in candidates if p.get('inpth')=='0']
  if not candidates:continue
  if not r['value']:skipped['nil-value']+=1;continue
  q=int(r['qtrs']);key=(r['adsh'],filed,end,q);general=starts(symbol).get(key,set())
  own_key=(r['adsh'],filed,'standard' if r['version'].startswith('us-gaap/') else 'custom',r['tag'],end,q,float(r['value']))
  ss=own_metadata[symbol].get(own_key,general)
  if len(ss)!=1:skipped['no-exact-duration']+=1;continue
  start,end=next(iter(ss));value=float(r['value'])
  if cik!=current and not any(p['current']==current and p['predecessor']==cik and end<p['before'] for p in config['predecessors']):continue
  # Multiple presentation labels for one tag must agree on the selected field's statement semantics.
  for p in candidates:
   record={'cik':cik,'tag':r['tag'],'taxonomy':r['version'],'statement':p['stmt'],'parenthetical':False,'label':p['plabel'],'segments':r.get('segments',''),'coreg':'','unit':'USD','start':start,'end':end,'val':value,'form':r['form'],'filed':filed,'accn':r['adsh'],'source':r['source'],'sha256':sha,'fp':r['fp'],'fy':int(r['fy']) if r['fy'] else None}
   ident=(cik,r['tag'],r['version'],r['adsh'],start,end,p['stmt'],p['plabel'])
   previous=records[symbol].get(ident)
   if previous and previous['val']!=value:raise ValueError('conflicting SEC archives '+str(ident))
   records[symbol][ident]=record
 print('READ',path.name,'companies',len(records),flush=True)
for symbol in by_symbol:(dest/(symbol+'.json')).write_text(json.dumps(list(records.get(symbol,{}).values())),encoding='utf8')
print('DONE',len(records),'companies',sum(len(rs) for rs in records.values()),'points','skipped',dict(skipped),flush=True)
