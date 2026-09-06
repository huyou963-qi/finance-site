"use client";
import { useState } from "react";
import { validateReviewInput } from "@/lib/equity/ownershipReviewValidation";
import type { OwnershipMonitorResult } from "@/lib/equity/ownershipEngine";
import type { ReviewPayload } from "@/lib/equity/ownershipTypes";

const field="w-full rounded-lg border border-fs-border bg-fs-elevated p-2 text-sm";
/** Authenticated evidence editor. Validation preview precedes the append-only submission. */
export function OwnershipReviewEditor({symbol,data,onSaved,seed}:{symbol:string;data:OwnershipMonitorResult;onSaved:()=>void;seed?:ReviewPayload}) {
 const [kind,setKind]=useState<ReviewPayload["kind"]>(seed?.kind??"transaction");
 const [key,setKey]=useState("");const [url,setUrl]=useState("");const [quote,setQuote]=useState("");
 const [date,setDate]=useState(data.asOf); const [text,setText]=useState(JSON.stringify(seed??{kind:"transaction",lineIds:[],action:"merge",canonicalId:null},null,2));
 const [preview,setPreview]=useState<ReturnType<typeof validateReviewInput>|null>(null);const [error,setError]=useState("");const [saving,setSaving]=useState(false);
 const templates:Record<ReviewPayload["kind"],object>={
  transaction:{kind:"transaction",lineIds:[],action:"merge",canonicalId:null},
  account:{kind:"account",lineIds:[],account:"",security:"",ownerCik:""},
  baseline:{kind:"baseline",account:"",security:"",ownerCik:"",date:data.asOf,shares:0,label:"解禁日收盘持仓"},
  float:{kind:"float",security:"",date:data.asOf,shares:0},role:{kind:"role",ownerCik:"",role:"VC / PE"},
  plan:{kind:"plan",plan:{id:"",ownerName:"",ownerCik:null,adopted:null,start:null,end:null,terminated:null,maxShares:null,security:null,account:null,status:"adopted",rule10b51:true,conditions:"",filedAt:data.asOf}},
 };
 const names={transaction:"经济交易 / 更正裁定",account:"受益账户映射",baseline:"起始持仓",float:"流通股分母",role:"持有人分类",plan:"计划条款核实"};
 async function save(){if(!preview)return;setSaving(true);setError("");try{const r=await fetch('/api/admin/ownership/reviews',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(preview)});const j=await r.json();if(!r.ok)throw new Error(j.error);setPreview(null);onSaved();}catch(e){setError(e instanceof Error?e.message:'写入失败');}finally{setSaving(false);}}
 return <div className="space-y-4 rounded-xl border border-fs-border p-5"><h3 className="font-semibold">证据审核（管理员）</h3><p className="text-sm text-fs-muted">每次保存追加一个版本，保留原文来源。交易行 ID 可从明细复制；合并需明确同一经济交易，更正仅替换所选原始行。</p>
 <div className="grid gap-3 md:grid-cols-2"><label className="text-sm">审核类型<select className={field} value={kind} onChange={e=>{const k=e.target.value as typeof kind;setKind(k);setText(JSON.stringify(templates[k],null,2));setPreview(null);}}>{Object.entries(names).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
 <label className="text-sm">证据键（修订时使用同一键）<input className={field} value={key} onChange={e=>{setKey(e.target.value);setPreview(null);}} placeholder="例如 plan:intrator:2026-03-05"/></label>
 <label className="text-sm">原文公开链接<input className={field} type="url" value={url} onChange={e=>{setUrl(e.target.value);setPreview(null);}}/></label><label className="text-sm">原文首次公开日期<input className={field} type="date" max={data.asOf} value={date} onChange={e=>{setDate(e.target.value);setPreview(null);}}/></label></div>
 <label className="block text-sm">原文证据<textarea className={field} rows={3} value={quote} onChange={e=>{setQuote(e.target.value);setPreview(null);}}/></label>
 <details><summary className="cursor-pointer text-sm text-fs-accent">填写说明</summary><p className="mt-2 text-sm leading-6 text-fs-muted">交易裁定：merge 合并、replace 更正、separate 确认独立、exclude 排除；canonicalId 为保留行。账户与基准使用同一 account 和 security。流通股填股数，不填比例或总股本。计划 id 沿用计划卡片 ID，未知字段填 null；采用、终止和执行窗口均须来源支持。审核内容中的日期均为原文日期，不是录入日期。</p></details>
 <label className="block text-sm">结构化证据<textarea className={`${field} font-mono`} rows={12} value={text} onChange={e=>{setText(e.target.value);setPreview(null);}} spellCheck={false}/></label>
 {error?<p role="alert" className="text-sm text-red-400">{error}</p>:null}
 <button className="rounded-lg border border-fs-border px-4 py-2 text-sm" onClick={()=>{try{const payload=JSON.parse(text);if(payload.kind!==kind)throw new Error('审核类型不一致');setPreview(validateReviewInput({symbol,key,expectedRevision:data.reviewFacts.find(r=>r.key===key)?.revision??0,payload,sourceUrl:url,quote,availableAt:date}));setError('');}catch(e){setError(e instanceof Error?e.message:'格式无效');}}}>校验并预览</button>
 {preview?<div className="space-y-3 rounded-lg bg-fs-elevated p-4"><p className="text-sm">将追加 {names[kind]} · {preview.key} · 版本 {preview.expectedRevision+1}，不会删除历史版本。</p><pre className="max-h-64 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(preview.payload,null,2)}</pre><button disabled={saving} className="rounded-lg bg-fs-accent px-4 py-2 text-sm text-white" onClick={save}>{saving?'保存中…':'保存核实结果'}</button></div>:null}
 </div>;
}
