import argparse,csv,io,json,zipfile,hashlib
from pathlib import Path
csv.field_size_limit(4*1024*1024)
parser=argparse.ArgumentParser(description="本地处理SEC官方DERA归档；不在生产机运行，不访问外网")
parser.add_argument('--workspace',required=True,help='包含 securities.json、policy.json、facts/、archives/ 的独立目录')
args=parser.parse_args();b=Path(args.workspace);root=b/'archives'
secs=json.loads((b/'securities.json').read_text(encoding='utf8'))
bycik={str(int(s['cik'])):s['symbol'] for s in secs if s.get('cik')}
cfg=json.loads((b/'policy.json').read_text())
for rule in cfg['predecessors']:
 if str(rule['current']) in bycik:bycik[str(rule['predecessor'])]=bycik[str(rule['current'])]
periods=sorted(p.stem for p in root.glob('20??q[1-4].zip'))
if not periods or len(periods)>48:raise ValueError('归档须为1–48份；单份不超过200MiB')
policy_hash=hashlib.sha256((b/'policy.json').read_bytes()+(b/'securities.json').read_bytes()).hexdigest()
for q in periods:
 path=root/(q+'.zip');result=root/(q+'.statements.jsonl')
 marker=root/(q+'.manifest.json')
 if path.stat().st_size>200*1024*1024:raise ValueError('归档超过200MiB')
 with path.open('rb') as archive_file:sha=hashlib.file_digest(archive_file,'sha256').hexdigest()
 old=json.loads(marker.read_text()) if marker.exists() else {}
 if result.exists() and old.get('policyHash')==policy_hash and old.get('sha256')==sha:print('RESUME',q,flush=True);continue
 url='https://www.sec.gov/files/dera/data/financial-statement-data-sets/'+q+'.zip'
 print('SCAN',q,path.stat().st_size,flush=True)
 with zipfile.ZipFile(path) as z:
  def rows(name):return csv.DictReader(io.TextIOWrapper(z.open(name),encoding='utf8'),delimiter='\t')
  sub={r['adsh']:r for r in rows('sub.txt') if r['cik'] in bycik and r['form'] in ['10-K','10-Q','10-K/A','10-Q/A']}
  pre={}
  for r in rows('pre.txt'):
   if r['adsh'] not in sub or r['stmt'] not in ['CF','IS']:continue
   pre.setdefault((r['adsh'],r['tag'],r['version']),[]).append({k:r[k] for k in ['stmt','line','plabel','inpth']+(['negating'] if 'negating'in r else [])})
  with result.with_suffix('.part').open('w',encoding='utf8') as out:
   count=0
   for r in rows('num.txt'):
    key=(r['adsh'],r['tag'],r['version'])
    allowed_dimension=(sub.get(r['adsh'],{}).get('cik') in ['1841666','6769'] and r['tag']=='Revenues' and r.get('segments')=='ProductOrService=OilAndGas;') or (sub.get(r['adsh'],{}).get('cik')=='811156' and r['tag']=='PaymentsToAcquirePropertyPlantAndEquipment' and r.get('segments')=='PropertyPlantAndEquipmentByType=OngoingCapitalExpenditures;')
    if key not in pre or r['uom']!='USD' or r['coreg'] or (r.get('segments','') and not allowed_dimension) or r['qtrs']=='0':continue
    s=sub[r['adsh']]
    item={'symbol':bycik[s['cik']],'cik':s['cik'],'filed':s['filed'],'form':s['form'],'fy':s['fy'],'fp':s['fp'],'reportPeriod':s['period'],'tag':r['tag'],'version':r['version'],'segments':r.get('segments',''),'presentation':pre[key],'adsh':r['adsh'],'end':r['ddate'],'qtrs':r['qtrs'],'value':r['value'],'source':url}
    out.write(json.dumps(item)+'\n');count+=1
  result.with_suffix('.part').replace(result)
  marker.write_text(json.dumps({'version':4,'policyHash':policy_hash,'source':url,'count':count,'consolidatedOnly':True,'dimensionExceptions':['APA total oil/gas revenue','CMS ongoing cash capex'],'sha256':sha}))
  print('DONE',q,'facts',count,'filings',len(sub),'sha256',sha,flush=True)
print('ALL_COMPLETED',flush=True)
