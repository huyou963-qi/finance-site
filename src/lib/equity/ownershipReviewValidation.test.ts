import assert from "node:assert/strict";
import {test} from "node:test";
import {validateReviewInput,validateReviewPayload,isDay} from "./ownershipReviewValidation";
test("拒绝错误单位、日期、非法来源和缺少证据",()=>{
 assert.equal(isDay('2026-02-30'),false);
 assert.throws(()=>validateReviewPayload({kind:'float',security:'Common Stock',date:'2026-08-01',shares:Infinity}));
 const input={symbol:'CRWV',key:'float:test',expectedRevision:0,payload:{kind:'float',security:'Common Stock',date:'2026-08-01',shares:1000},sourceUrl:'https://www.sec.gov/test',quote:'The public float consists of 1,000 common shares.',availableAt:'2026-08-02'};
 assert.equal(validateReviewInput(input).payload.kind,'float');
 assert.throws(()=>validateReviewInput({...input,sourceUrl:'javascript:alert(1)'}));
 assert.throws(()=>validateReviewInput({...input,quote:'guess'}));
 assert.throws(()=>validateReviewInput({...input,availableAt:'2026-07-01'}));
});
test("合并和更正必须指向参与裁定的保留行",()=>{
 assert.throws(()=>validateReviewPayload({kind:'transaction',lineIds:['a','b'],action:'replace',canonicalId:'c'}));
 assert.throws(()=>validateReviewPayload({kind:'transaction',lineIds:['a','a'],action:'merge',canonicalId:'a'}));
});
