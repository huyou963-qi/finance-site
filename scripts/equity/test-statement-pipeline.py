import csv,io,json,zipfile,subprocess,sys
from pathlib import Path
root=Path.cwd();b=root/'.data/statement-pipeline-fixture';(b/'archives').mkdir(parents=True,exist_ok=True);(b/'facts').mkdir(exist_ok=True)
(b/'securities.json').write_text(json.dumps([{'symbol':'TEST','cik':'999'}]));(b/'policy.json').write_text(json.dumps({'capex':{},'legacy':{},'predecessors':[]}))
a='0000000999-24-000001';tag='NetCashProvidedByUsedInOperatingActivities'
with zipfile.ZipFile(b/'archives/2024q2.zip','w')as z:
 def table(name,headers,rows):
  s=io.StringIO();w=csv.writer(s,delimiter='\t',lineterminator='\n');w.writerow(headers);w.writerows(rows);z.writestr(name,s.getvalue())
 table('sub.txt',['adsh','cik','form','fy','fp','period','filed'],[[a,'999','10-Q','2024','Q1','20240331','20240501']])
 table('pre.txt',['adsh','tag','version','stmt','line','plabel','inpth','negating'],[[a,tag,'us-gaap/2024','CF','1','Net cash provided by operating activities','0','0']])
 table('num.txt',['adsh','tag','version','coreg','ddate','qtrs','uom','value','segments'],[[a,tag,'us-gaap/2024',coreg,'20240331','1','USD',str(v),seg]for coreg,v,seg in [('',10,''),('',99,'LegalEntity=Subsidiary;'),('OtherCo',88,'')]])
p={'start':'2024-01-01','end':'2024-03-31','form':'10-Q','filed':'2024-05-01','accn':a,'val':10}
def raw(points):(b/'facts/TEST.json').write_text(json.dumps({'cik':999,'facts':{'us-gaap':{tag:{'units':{'USD':points}}}}}))
raw([p])
for script in ['scan-sec-statement-archives.py','prepare-sec-statement-facts.py']:subprocess.run([sys.executable,str(root/'scripts/equity'/script),'--workspace='+str(b)],check=True,timeout=30)
out=json.loads((b/'supplements/TEST.json').read_text());assert len(out)==1 and out[0]['val']==10
raw([{**p,'end':'2024-03-30'}]);subprocess.run([sys.executable,str(root/'scripts/equity/prepare-sec-statement-facts.py'),'--workspace='+str(b)],check=True,timeout=30);assert json.loads((b/'supplements/TEST.json').read_text())[0]['end']=='2024-03-30'
raw([p,{**p,'start':'2024-01-02'}]);subprocess.run([sys.executable,str(root/'scripts/equity/prepare-sec-statement-facts.py'),'--workspace='+str(b)],check=True,timeout=30);assert json.loads((b/'supplements/TEST.json').read_text())==[]
print('PASS: consolidated-only, SEC rounded-end mapping to actual dates, ambiguity rejection, stale-output reset')
