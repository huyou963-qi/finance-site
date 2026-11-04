import test from "node:test";
import assert from "node:assert/strict";
import { parseSecPeriodicInstance, mergeSecPeriodicInstance, primaryCashFlowLabels, supplementSecPeriodicFiling, supplementSecPeriodicFilingPair, type PeriodicFiling } from "./secFilingFacts";
import { statementSupplementFlows } from "./secStatementSupplement";
import { extractQuarterlyFundamentals } from "./secFundamentals";

const filing = { accession: "0000906345-26-000002", form: "10-Q", filedAt: "2026-08-01", primaryDocument: "report-20260630.htm", reportDate: "2026-06-30" };
function fixture(cik = 906345, q1 = false, includeOther = false) {
  const end = q1 ? "2026-03-31" : "2026-06-30", tag = cik === 879101 ? "PaymentsForImprovementsToOperatingRealEstate" : "PaymentsToDevelopRealEstateAssets";
  const label = cik === 879101 ? "Improvements to operating real estate" : "Development and capital improvements, including land";
  const context = (id: string, owner: number, start = "2026-01-01", extra = "") => `<x:context id="${id}"><x:entity><x:identifier scheme="http://www.sec.gov/CIK">${owner}</x:identifier>${extra}</x:entity><x:period><x:startDate>${start}</x:startDate><x:endDate>${end}</x:endDate></x:period></x:context>`;
  const amount = (name: string, value: number, ref = "y", unit = "usd", extra = "") => `<g:${name} contextRef="${ref}" unitRef="${unit}" decimals="-6" ${extra}>${value}</g:${name}>`;
  const xml = `<x:xbrl xmlns:x="http://www.xbrl.org/2003/instance" xmlns:g="http://fasb.org/us-gaap/2026" xmlns:iso="http://www.xbrl.org/2003/iso4217" xmlns:fake="http://example.invalid/currency" xmlns:dei="http://xbrl.sec.gov/dei/2026" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
    ${context("y", cik)}${context("q", cik, q1 ? "2026-01-01" : "2026-04-01")}${context("other", cik + 1)}
    ${context("dim", cik, "2026-01-01", '<x:segment><member>Subsidiary</member></x:segment>')}
    <x:unit id="usd"><x:measure>iso:USD</x:measure></x:unit><x:unit id="fake"><x:measure>fake:USD</x:measure></x:unit>
    <x:unit id="perShare"><x:divide><x:unitNumerator><x:measure>iso:USD</x:measure></x:unitNumerator><x:unitDenominator><x:measure>x:shares</x:measure></x:unitDenominator></x:divide></x:unit>
    <dei:DocumentFiscalPeriodFocus contextRef="y">${q1 ? "Q1" : "Q2"}</dei:DocumentFiscalPeriodFocus>
    ${amount("RevenueFromContractWithCustomerExcludingAssessedTax", 70, "q")}${amount("OperatingLeaseLeaseIncome", 70, "q")}
    ${amount("NetIncomeLoss", -20, "q")}${amount("NetCashProvidedByUsedInOperatingActivities", q1 ? 100 : 300)}
    ${amount(tag, q1 ? 30 : 100)}${includeOther ? amount("PaymentsToAcquireOtherPropertyPlantAndEquipment", 4) : ""}
    ${amount("NetCashProvidedByUsedInOperatingActivities", 9999, "other")}${amount("NetCashProvidedByUsedInOperatingActivities", 8888, "dim")}
    ${amount("FakeCurrency", 3, "y", "fake")}${amount("EarningsPerShareDiluted", 7, "y", "perShare")}
    ${amount("NilAmount", 5, "y", "usd", 'xsi:nil="true"')}
  </x:xbrl>`;
  const names = ["NetCashProvidedByUsedInOperatingActivities", tag, ...(includeOther ? ["PaymentsToAcquireOtherPropertyPlantAndEquipment"] : [])];
  const labels = names.map(name => name === tag ? label : name === "NetCashProvidedByUsedInOperatingActivities" ? "Net cash provided by operating activities" : "Other property, plant and equipment");
  const summary = `<FilingSummary><MyReports><Report><MenuCategory>Statements</MenuCategory><ShortName>CONSOLIDATED STATEMENTS OF CASH FLOWS</ShortName><Role>http://example.com/CashFlows</Role></Report></MyReports></FilingSummary>`;
  const pre = `<link:linkbase><link:presentationLink xlink:role="http://example.com/CashFlows">${names.map((name, i) => `<link:loc xlink:label="p${i}" xlink:href="tax.xsd#g_${name}"/><link:presentationArc xlink:from="root" xlink:to="p${i}"/>`).join("")}</link:presentationLink></link:linkbase>`;
  const lab = `<link:linkbase><link:labelLink>${names.map((name, i) => `<link:loc xlink:label="p${i}" xlink:href="tax.xsd#g_${name}"/><link:label xlink:label="l${i}" xml:lang="en-US" xlink:role="http://www.xbrl.org/2003/role/label">${labels[i]}</link:label><link:labelArc xlink:from="p${i}" xlink:to="l${i}"/>`).join("")}</link:labelLink></link:linkbase>`;
  return { xml, pre, lab, summary, end };
}
function transport(cik = 906345, q1 = false, other = false) {
  const f = fixture(cik, q1, other), stem = `report-${f.end.replace(/-/g, "")}`, calls: string[] = [];
  return { calls, json: async<T>(url: string) => { calls.push(url); return { directory: { item: ["_htm.xml", "_pre.xml", "_lab.xml"].map(s => ({ name: stem + s, size: 1000 })).concat([{ name: "FilingSummary.xml", size: 100 }]) } } as T; },
    text: async(url: string) => { calls.push(url); return url.endsWith("_htm.xml") ? f.xml : url.endsWith("_pre.xml") ? f.pre : url.endsWith("_lab.xml") ? f.lab : f.summary; } };
}

test("primary instance keeps actual USD amounts, losses and dates; excludes subsidiary, dimensions, nil and USD/share", () => {
  const parsed = parseSecPeriodicInstance(fixture().xml, filing, 906345);
  assert.equal(parsed.concepts.get("g:NetIncomeLoss")?.points[0]?.val, -20);
  assert.equal(parsed.concepts.get("g:NetCashProvidedByUsedInOperatingActivities")?.points[0]?.val, 300);
  assert.equal(parsed.concepts.get("g:NetCashProvidedByUsedInOperatingActivities")?.points.length, 1);
  assert.equal(parsed.concepts.has("g:FakeCurrency"), false);
  assert.equal(parsed.concepts.has("g:EarningsPerShareDiluted"), false);
  assert.equal(parsed.concepts.has("g:NilAmount"), false);
  const merged = mergeSecPeriodicInstance({ cik: 906345, facts: {} }, parsed, 906345);
  assert.equal(merged.facts["us-gaap"]?.NetIncomeLoss?.units?.USD?.[0]?.end, "2026-06-30");
  assert.equal(merged.facts["us-gaap"]?.NetIncomeLoss?.units?.USD?.[0]?.fp, "Q2");
  assert.equal(merged.facts["us-gaap"]?.NetIncomeLoss?.units?.USD?.[0]?.val, -20, "decimals must never scale an amount");
});
test("instance identity, malformed dates, contradictory values and unsafe XML fail closed", () => {
  const f = fixture();
  assert.equal(parseSecPeriodicInstance(f.xml.replace("2026-06-30", "2026-02-31"), filing, 906345).concepts.has("g:NetCashProvidedByUsedInOperatingActivities"), false);
  assert.throws(() => parseSecPeriodicInstance(f.xml, { ...filing, accession: "wrong" }, 906345), /身份/);
  assert.throws(() => parseSecPeriodicInstance('<!DOCTYPE x [<!ENTITY x "hi">]>'+f.xml, filing, 906345), /XML/);
  assert.throws(() => parseSecPeriodicInstance(f.xml.replace('</x:xbrl>', '<g:NetIncomeLoss contextRef="q" unitRef="usd">2</g:NetIncomeLoss></x:xbrl>'), filing, 906345), /金额冲突/);
  assert.throws(() => mergeSecPeriodicInstance({ cik: 1, facts: {} }, parseSecPeriodicInstance(f.xml, filing, 906345), 906345), /主体/);
});
test("repeated facts with declared different rounding retain the more precise amount", () => {
  const f = fixture(), exact = '<g:Goodwill contextRef="q" unitRef="usd" decimals="-6">19010000000</g:Goodwill>';
  const coarse = '<g:Goodwill contextRef="q" unitRef="usd" decimals="-8">19000000000</g:Goodwill>';
  for (const pair of [exact + coarse, coarse + exact]) {
    const parsed = parseSecPeriodicInstance(f.xml.replace('</x:xbrl>', pair + '</x:xbrl>'), filing, 906345);
    assert.equal(parsed.concepts.get('g:Goodwill')?.points[0]?.val, 19010000000);
  }
  assert.throws(() => parseSecPeriodicInstance(f.xml.replace('</x:xbrl>', exact + coarse.replace('19000000000', '18000000000') + '</x:xbrl>'), filing, 906345), /金额冲突/);
});

test("cache merge is immutable, idempotent and rejects a conflicting fact for the same accession and span", () => {
  const parsed = parseSecPeriodicInstance(fixture().xml, filing, 906345), original = { cik: 906345, facts: {} };
  const once = mergeSecPeriodicInstance(original, parsed, 906345), twice = mergeSecPeriodicInstance(once, parsed, 906345);
  assert.deepEqual(original, { cik: 906345, facts: {} }); assert.deepEqual(twice, once);
  const dirty = structuredClone(once); dirty.facts["us-gaap"]!.NetIncomeLoss!.units!.USD![0]!.val = 999;
  assert.throws(() => mergeSecPeriodicInstance(dirty, parsed, 906345), /缓存与申报事实冲突/);
});
test("cash-flow labels must come from the unique primary statement and exact preferred label", () => {
  const f = fixture(), selected = primaryCashFlowLabels(f.summary, f.pre, f.lab);
  assert.equal(selected?.labels.get("g:PaymentsToDevelopRealEstateAssets"), "Development and capital improvements, including land");
  assert.equal(primaryCashFlowLabels(f.summary.replace('</MyReports>', '<Report><MenuCategory>Statements</MenuCategory><ShortName>Subsidiary Cash Flows</ShortName><Role>http://child/CashFlows</Role></Report></MyReports>'), f.pre, f.lab), null);
  assert.equal(primaryCashFlowLabels(f.summary.replace('Statements','Notes'), f.pre, f.lab), null);
});

test("joint filings select a named cash-flow statement only by the same CIK's exact DEI registrant name", () => {
  const f = fixture(), named = f.summary.replace('CONSOLIDATED STATEMENTS OF CASH FLOWS', 'Consolidated Statements of Cash Flows - DTE Energy Company')
    .replace('</MyReports>', '<Report><MenuCategory>Statements</MenuCategory><ShortName>Consolidated Statements of Cash Flows - DTE Electric Company</ShortName><Role>http://child/CashFlows</Role></Report></MyReports>');
  const xml = f.xml.replace('</x:xbrl>', '<dei:EntityRegistrantName contextRef="y">DTE Energy Co</dei:EntityRegistrantName><dei:EntityRegistrantName contextRef="other">DTE Electric Company</dei:EntityRegistrantName></x:xbrl>');
  const parsed = parseSecPeriodicInstance(xml, filing, 906345);
  assert.equal(parsed.registrantName, 'DTE Energy Co');
  assert.equal(primaryCashFlowLabels(named, f.pre, f.lab, parsed.registrantName)?.role, 'http://example.com/CashFlows');
  assert.equal(primaryCashFlowLabels(named, f.pre, f.lab, 'DTE Energy'), null);
  assert.equal(primaryCashFlowLabels(named, f.pre, f.lab), null);
});
test("CPT and KIM accept a reported combined capital line only when the complete primary statement omits the old separate component", async () => {
  for (const cik of [906345, 879101]) {
    const t = transport(cik), enriched = await supplementSecPeriodicFiling({ cik, facts: {} }, cik, filing, t);
    assert.equal(t.calls.length, 5);
    assert.equal(statementSupplementFlows(enriched).capex[0]?.val, 100);
    const incomplete = structuredClone(enriched), proof = incomplete.secFilingStatementProofs![filing.accession]!;
    proof.cashFlowConcepts.push(cik === 906345 ? 'g:PaymentsToAcquireOtherPropertyPlantAndEquipment' : 'g:PaymentsToDevelopRealEstateAssets');
    assert.equal(statementSupplementFlows(incomplete).capex.length, 0, "present but valueless component cannot be assumed zero");
    const corrupt = structuredClone(enriched); corrupt.secFilingStatementProofs![filing.accession]!.labels.url = 'https://www.sec.gov/Archives/edgar/data/1/fake/labels.xml';
    assert.throws(() => statementSupplementFlows(corrupt), /元数据/);
    const noProof = structuredClone(enriched); delete noProof.secFilingStatementProofs;
    assert.throws(() => statementSupplementFlows(noProof), /元数据/);
  }
  const cpt = await supplementSecPeriodicFiling({ cik: 906345, facts: {} }, 906345, filing, transport(906345, false, true));
  assert.equal(statementSupplementFlows(cpt).capex[0]?.val, 104, "a separately reported extra PPE amount remains required");
});
test("embedded schema linkbases require an explicit instance reference, matching namespace and complete source hashes", async () => {
  const f = fixture(), schemaName = 'report-20260630.xsd';
  f.xml = f.xml.replace('<x:xbrl ', '<x:xbrl xmlns:issuer="https://issuer.example/2026" ')
    .replace('</x:xbrl>', `<link:schemaRef xlink:href="${schemaName}"/></x:xbrl>`);
  const schema = `<xs:schema targetNamespace="https://issuer.example/2026"><xs:annotation><xs:appinfo>${f.pre}${f.lab}</xs:appinfo></xs:annotation></xs:schema>`;
  const t = { json: async<T>() => ({directory:{item:[{name:'report-20260630_htm.xml',size:1000},{name:schemaName,size:1000},{name:'FilingSummary.xml',size:100}]}} as T),
    text: async(url: string) => url.endsWith('_htm.xml') ? f.xml : url.endsWith('.xsd') ? schema : f.summary };
  const result = await supplementSecPeriodicFiling({cik:906345,facts:{}},906345,filing,t);
  assert.equal(statementSupplementFlows(result).capex[0]?.val,100);
  const proof = result.secFilingStatementProofs![filing.accession]!;
  assert.equal(proof.linkbaseStorage,'schema');assert.equal(proof.presentation.url,proof.labels.url);
  const bad = structuredClone(result);bad.secFilingStatementProofs![filing.accession]!.labels.sha256='f'.repeat(64);
  assert.throws(()=>statementSupplementFlows(bad),/元数据/);
  await assert.rejects(()=>supplementSecPeriodicFiling({cik:906345,facts:{}},906345,filing,{...t,text:async(u:string)=>(await t.text(u)).replace('targetNamespace="https://issuer.example/2026"','targetNamespace="https://wrong.example/2026"')}),/命名空间/);
  const absent=await supplementSecPeriodicFiling({cik:906345,facts:{}},906345,filing,{...t,text:async(u:string)=>u.endsWith('_htm.xml')?f.xml.replace(`<link:schemaRef xlink:href="${schemaName}"/>`,''):t.text(u)});
  assert.equal(absent.secFilingStatementProofs,undefined);
  const separate={...transport(),json:async<T>()=>({directory:{item:['report-20260630x10q_htm.xml','report-20260630_pre.xml','report-20260630_lab.xml','FilingSummary.xml'].map(name=>({name,size:1000}))}} as T),
    text:async(u:string)=>u.endsWith('_htm.xml')?f.xml:u.endsWith('_pre.xml')?f.pre:u.endsWith('_lab.xml')?f.lab:f.summary};
  assert.equal(statementSupplementFlows(await supplementSecPeriodicFiling({cik:906345,facts:{}},906345,filing,separate)).capex[0]?.val,100);
});

test("DTE's verified utility and non-utility cash lines remain two required components after 2022", async () => {
  const f = fixture(936340, false, true);
  f.xml = f.xml.replace('<x:xbrl ', '<x:xbrl xmlns:dte="http://www.dteenergy.com/2026" ');
  for (const key of ['xml', 'pre', 'lab'] as const) {
    f[key] = f[key].replaceAll(key === 'xml' ? 'g:PaymentsToDevelopRealEstateAssets' : 'g_PaymentsToDevelopRealEstateAssets', key === 'xml' ? 'dte:PlantAndEquipmentExpendituresUtility' : 'dte_PlantAndEquipmentExpendituresUtility')
      .replaceAll(key === 'xml' ? 'g:PaymentsToAcquireOtherPropertyPlantAndEquipment' : 'g_PaymentsToAcquireOtherPropertyPlantAndEquipment', key === 'xml' ? 'dte:PlantAndEquipmentExpendituresNonUtility' : 'dte_PlantAndEquipmentExpendituresNonUtility');
  }
  f.lab = f.lab.replace('Development and capital improvements, including land', 'Plant and equipment expenditures&#160;&#8212; utility').replace('Other property, plant and equipment', 'Plant and equipment expenditures&#160;&#8212; non-utility');
  const t = { ...transport(936340, false, true), text: async(url: string) => url.endsWith('_htm.xml') ? f.xml : url.endsWith('_pre.xml') ? f.pre : url.endsWith('_lab.xml') ? f.lab : f.summary };
  const result = await supplementSecPeriodicFiling({ cik: 936340, facts: {} }, 936340, filing, t);
  assert.equal(statementSupplementFlows(result).capex[0]?.val, 104);
  result.statementSupplement = result.statementSupplement?.filter(p => (p as {tag: string}).tag !== 'PlantAndEquipmentExpendituresNonUtility');
  assert.equal(statementSupplementFlows(result).capex.length, 0);
});

test("PSA 2022 accepts two historical cash lines only when the complete statement omits the newer split categories", async () => {
  const f=fixture(1393311,false,true);
  f.xml=f.xml.replace('<x:xbrl ','<x:xbrl xmlns:psa="https://www.publicstorage.com/2022" ').replaceAll('2026-','2022-');
  for(const key of ['xml','pre','lab'] as const){
    f[key]=f[key].replaceAll(key==='xml'?'g:PaymentsToDevelopRealEstateAssets':'g_PaymentsToDevelopRealEstateAssets',key==='xml'?'psa:CapitalExpendituresToMaintainRealEstateFacilities':'psa_CapitalExpendituresToMaintainRealEstateFacilities')
      .replaceAll(key==='xml'?'g:PaymentsToAcquireOtherPropertyPlantAndEquipment':'g_PaymentsToAcquireOtherPropertyPlantAndEquipment',key==='xml'?'psa:DevelopmentAndExpansionOfRealEstateFacilities':'psa_DevelopmentAndExpansionOfRealEstateFacilities');
  }
  f.lab=f.lab.replace('Development and capital improvements, including land','Capital expenditures to maintain real estate facilities').replace('Other property, plant and equipment','Development and expansion of real estate facilities');
  const t={...transport(1393311,false,true),text:async(u:string)=>u.endsWith('_htm.xml')?f.xml:u.endsWith('_pre.xml')?f.pre:u.endsWith('_lab.xml')?f.lab:f.summary};
  const result=await supplementSecPeriodicFiling({cik:1393311,facts:{}},1393311,filing,t);
  assert.equal(statementSupplementFlows(result).capex[0]?.val,104);
  result.secFilingStatementProofs![filing.accession]!.cashFlowConcepts.push('psa:CapitalExpendituresForEnergyEfficiencies');
  assert.equal(statementSupplementFlows(result).capex.length,0,'a present but valueless newer component is not zero');
});

test("lagging upstream can be repaired from at most current and prior filing, preserving a real cumulative difference", async () => {
  const previous = { ...filing, accession: '0000906345-26-000001', reportDate: '2026-03-31', filedAt: '2026-05-01' };
  const calls: string[] = [];
  const dependencies = { supplement: async(facts: unknown, cik: number, selected: PeriodicFiling) => {
    calls.push(selected.accession); return supplementSecPeriodicFiling(facts, cik, selected, transport(cik, selected.accession === previous.accession));
  }, discover: async() => [previous, { ...previous, accession: '0000906345-26-000003', filedAt: '2026-08-10' }] };
  const first = await supplementSecPeriodicFilingPair({ cik: 906345, facts: {} }, 906345, filing, 1, dependencies);
  assert.deepEqual(first.handledAccessions, []); assert.equal(first.filingsUsed, 1);
  calls.length = 0;
  const both = await supplementSecPeriodicFilingPair({ cik: 906345, facts: {} }, 906345, filing, 2, dependencies);
  assert.deepEqual(calls, [filing.accession, previous.accession]); assert.equal(both.filingsUsed, 2);
  const quarter = extractQuarterlyFundamentals(both.facts).find(p => p.period === '2026Q2');
  assert.equal(quarter?.ocf, 200); assert.equal(quarter?.capex, 70);
  assert.ok(both.handledAccessions.includes(filing.accession));
});
