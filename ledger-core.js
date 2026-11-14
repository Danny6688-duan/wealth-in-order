/* 账户流水唯一业务实现：浏览器和本机服务共同执行。金额先转为整数分。 */
(function(root){
'use strict';
const KINDS={income:'收入',expense:'支出',transfer:'转账'},LIMIT=10000;
const empty=()=>({version:1,accounts:[],entries:[],reconciliations:[]});
const round=n=>Math.round((n+Number.EPSILON)*100)/100;
const uuid=()=>crypto.randomUUID();
function text(v,label,max=500,required=false){if(typeof v!=='string'||v.length>max||(required&&!v.trim()))throw Error(label+'格式错误或为空');return v.trim();}
function cents(value){
 if(!['string','number'].includes(typeof value)||(typeof value==='number'&&!Number.isFinite(value)))throw Error('金额格式错误');
 const s=String(value).trim();
 // Parse decimal text, including exponents, without relying on binary fractional arithmetic.
 const match=/^\+?(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(s);
 if(!match||s.length>200)throw Error('金额须为非负数，最多两位小数');
 const fraction=match[2]||'',exponent=Number(match[3]||0),power=exponent-fraction.length+2;
 if(Math.abs(exponent)>100)throw Error('金额须为非负数，最多两位小数');
 let n=BigInt(match[1]+fraction);
 if(power>=0)n*=10n**BigInt(power);else{const divisor=10n**BigInt(-power);if(n%divisor!==0n)throw Error('金额须为非负数，最多两位小数');n/=divisor;}
 if(n>100000000000000n)throw Error('金额须为非负数，最多两位小数');return Number(n);
}
function day(value,now){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value||value>now)throw Error('日期须为有效 YYYY-MM-DD，且不能晚于今天');return value;}
function collection(rows,label){if(!Array.isArray(rows)||rows.length>LIMIT)throw Error(label+'格式错误或超过10000条');const ids=new Set();for(const row of rows){if(!row||typeof row!=='object'||Array.isArray(row))throw Error(label+'记录格式错误');const key=text(row.id,label+'ID',80,true);if(ids.has(key))throw Error(label+'ID重复');ids.add(key);}}
function validateEntry(e,accounts,now){
 day(e.date,now);if(!Object.hasOwn(KINDS,e.kind)||cents(e.amount)<=0)throw Error('流水类型错误或金额不大于0');
 const account=accounts.get(e.accountId);if(!account||e.date<account.openingDate)throw Error('流水账户不存在，或日期早于期初日期');
 if(e.kind==='transfer'){const target=accounts.get(e.toAccountId);if(!target||target.id===account.id||e.date<target.openingDate)throw Error('转账须选择另一流水账户，且不早于双方期初日期');}
 else if(e.toAccountId)throw Error('收入和支出不能填写转入账户');
 for(const [key,max] of [['category',100],['note',500],['externalId',200],['source',100]])text(e[key]??'',key,max);
}
function validate(state,now){
 const l=state.ledger??empty();if(!l||l.version!==1)throw Error('账户流水版本错误');
 for(const key of ['accounts','entries','reconciliations'])collection(l[key],key);
 const assets=new Map(state.assets.map(a=>[a.id,a])),accounts=new Map(l.accounts.map(a=>[a.id,a])),used=new Set(),external=new Set();
 for(const a of accounts.values()){
  const asset=assets.get(a.assetId);if(!asset||asset.category!=='cash'||asset.aggregate)throw Error('流水账户须关联已拆分的现金或存款资产；移除或改变资产前请先处理流水账户');
  if(used.has(asset.id))throw Error('同一资产不能重复关联流水账户');used.add(asset.id);cents(asset.amount);cents(a.openingBalance);day(a.openingDate,now);text(a.source??'','期初余额依据',200);
  if(a.openingDate>asset.updated)throw Error('期初日期不能晚于资产余额日期');
 }
 for(const e of l.entries){validateEntry(e,accounts,now);if(e.externalId){const key=JSON.stringify([e.accountId,e.source??'',e.externalId]);if(external.has(key))throw Error('同一账户与来源下的外部流水ID重复');external.add(key);}}
 for(const r of l.reconciliations){day(r.date,now);if(!accounts.has(r.accountId))throw Error('对账账户不存在');cents(r.observed);if(typeof r.expected!=='number'||!Number.isFinite(r.expected)||Math.abs(r.expected)>2e16)throw Error('对账计算金额错误');text(r.source,'实际余额依据',200,true);text(r.note??'','对账备注');}
 return true;
}
function expected(l,account,asOf){let value=BigInt(cents(account.openingBalance));for(const e of l.entries){if(e.date<account.openingDate||e.date>asOf)continue;const n=BigInt(cents(e.amount));if(e.accountId===account.id)value+=e.kind==='income'?n:-n;else if(e.kind==='transfer'&&e.toAccountId===account.id)value+=n;}return Number(value)/100;}
function report(state,now){
 const l=state.ledger??empty(),assets=new Map(state.assets.map(a=>[a.id,a]));
 const accounts=l.accounts.map(account=>{const a=assets.get(account.assetId),book=expected(l,account,a.updated);return {...account,name:a.name,observed:a.amount,asOf:a.updated,expected:book,difference:round(a.amount-book),expectedToday:expected(l,account,now),laterEntries:l.entries.filter(e=>e.date>a.updated&&(e.accountId===account.id||e.toAccountId===account.id)).length};});
 const result={accounts,entryCount:l.entries.length,income:0,expense:0,transfer:0};for(const kind of Object.keys(KINDS)){let total=0n;for(const e of l.entries)if(e.kind===kind&&e.date.startsWith(now.slice(0,7)))total+=BigInt(cents(e.amount));result[kind]=Number(total)/100;}return result;
}
function action(state,b,now){
 const l=state.ledger;
 if(b.action==='account'){
  const account={id:uuid(),assetId:text(b.assetId,'资产ID',80,true),openingDate:day(b.openingDate,now),openingBalance:cents(b.openingBalance)/100,source:text(b.source??'','期初余额依据',200,true)};
  if(b.id){const old=l.accounts.find(a=>a.id===b.id);if(!old||old.assetId!==account.assetId)throw Error('账户不存在，或关联资产已改变');account.id=old.id;Object.assign(old,account);}else l.accounts.push(account);
 }else if(b.action==='delete-account'){
  if(l.entries.some(e=>e.accountId===b.id||e.toAccountId===b.id)||l.reconciliations.some(r=>r.accountId===b.id))throw Error('账户已有流水或对账记录，不能移除关联');l.accounts=l.accounts.filter(a=>a.id!==b.id);
 }else if(b.action==='entry'){
  const entry=Object.fromEntries(['date','kind','accountId','toAccountId','category','note'].map(k=>[k,b[k]??'']));Object.assign(entry,{id:uuid(),amount:cents(b.amount)/100,source:'手动录入',externalId:''});l.entries.push(entry);
 }else if(b.action==='delete-entry'){
  if(!l.entries.some(e=>e.id===b.id))throw Error('流水不存在，请刷新');l.entries=l.entries.filter(e=>e.id!==b.id);
 }else if(b.action==='reconcile'){
  const account=l.accounts.find(a=>a.id===b.accountId);if(!account)throw Error('流水账户不存在');if(b.date!==now)throw Error('实际余额核对仅支持今天；历史余额请保留在原始账单中');
  const observed=cents(b.observed)/100;l.reconciliations.push({id:uuid(),date:now,accountId:account.id,observed,expected:expected(l,account,now),source:text(b.source,'实际余额依据',200,true),note:text(b.note??'','对账备注')});Object.assign(state.assets.find(a=>a.id===account.assetId),{amount:observed,updated:now});
 }else throw Error('未知流水操作');
 validate(state,now);return state;
}
function signature(e){return JSON.stringify(['date','kind','amount','accountId','toAccountId','category','note'].map(k=>e[k]??''));}
function parseCsv(raw){
 const rows=[];let row=[],value='',quoted=false,afterQuote=false;
 function pushRow(){row.push(value);if(row.some(v=>v!==''))rows.push(row);if(rows.length>2001)throw Error('单次最多导入2000行');row=[];value='';afterQuote=false;}
 for(let i=0;i<raw.length;i++){
  const c=raw[i];if(quoted){if(c==='"'){if(raw[i+1]==='"'){value+='"';i++;}else{quoted=false;afterQuote=true;}}else value+=c;continue;}
  if(c==='"'){if(value||afterQuote)throw Error('CSV引号位置错误');quoted=true;}
  else if(c===','){row.push(value);value='';afterQuote=false;}
  else if(c==='\n'||c==='\r'){if(c==='\r'&&raw[i+1]==='\n')i++;pushRow();}
  else{if(afterQuote)throw Error('CSV引号后须为逗号或换行');value+=c;}
 }
 if(quoted)throw Error('CSV引号未闭合');if(value||row.length||afterQuote)pushRow();return rows;
}
async function csvPreview(state,b,now){
 const raw=text(b.csv,'CSV内容',2*1024*1024,true).replace(/^\uFEFF/,'');if(new TextEncoder().encode(raw).length>2*1024*1024)throw Error('CSV内容不能超过2MB（UTF-8编码后）');
 const mapping=b.mapping;if(!mapping||typeof mapping!=='object'||Array.isArray(mapping))throw Error('请配置列映射');
 const source=text(b.source,'账单来源',100,true),accountId=text(b.accountId,'导入账户',80,true),l=state.ledger,accounts=new Map(l.accounts.map(a=>[a.id,a]));if(!accounts.has(accountId))throw Error('请选择流水账户');
 const [headers,...data]=parseCsv(raw);if(!headers||headers.length>100||new Set(headers).size!==headers.length)throw Error('CSV表头为空、重复或列数超过100');
 for(const key of ['date','kind','amount'])if(!headers.includes(mapping[key]))throw Error('请映射日期、类型和金额列');
 for(const [key,value] of Object.entries(mapping))if(!['date','kind','amount','toAccount','category','note','externalId'].includes(key)||(value&&!headers.includes(value)))throw Error('列映射包含无效列');
 const assets=new Map(state.assets.map(a=>[a.id,a])),names=new Map();for(const a of accounts.values()){const name=assets.get(a.assetId).name;names.set(name,[...(names.get(name)||[]),a.id]);}
 const external=new Map(l.entries.filter(e=>e.externalId).map(e=>[JSON.stringify([e.accountId,e.source??'',e.externalId]),e]));
 const fingerprints=new Set(l.entries.filter(e=>e.accountId===accountId&&e.source===source).map(signature)),results=[],accepted=[];
 const kindMap={...Object.fromEntries(Object.keys(KINDS).map(k=>[k,k])),...Object.fromEntries(Object.entries(KINDS).map(([k,v])=>[v,k]))};
 data.forEach((row,index)=>{
  const record={row:index+2,status:'error',message:''};try{
   if(row.length!==headers.length)throw Error('该行列数与表头不一致');const col=key=>{const i=headers.indexOf(mapping[key]);return i<0?'':row[i].trim();};
   const kind=kindMap[col('kind')];if(!Object.hasOwn(KINDS,kind))throw Error('类型须为收入、支出、转账或 income/expense/transfer');
   const target=col('toAccount');let toAccountId='';if(kind==='transfer'){if(accounts.has(target))toAccountId=target;else if(names.get(target)?.length===1)toAccountId=names.get(target)[0];else throw Error('转入账户名称不存在或重名，请填写账户ID');}else if(target)throw Error('收入和支出不能填写转入账户');
   const amountText=col('amount');if(amountText.includes(',')&&!/^\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?$/.test(amountText))throw Error('金额千分位格式错误，请使用1234.50或1,234.50');
   const entry={id:uuid(),date:col('date'),kind,amount:cents(amountText.replaceAll(',',''))/100,accountId,toAccountId,category:col('category'),note:col('note'),externalId:col('externalId'),source};validateEntry(entry,accounts,now);
   const key=JSON.stringify([accountId,source,entry.externalId]),previous=entry.externalId?external.get(key):null,fingerprint=signature(entry);
   if(previous&&signature(previous)!==fingerprint)throw Error('外部流水ID已存在，但内容不同，请核对原账单');
   if(previous||(!entry.externalId&&fingerprints.has(fingerprint)))Object.assign(record,{status:'duplicate',message:'相同记录，跳过',entry});
   else{Object.assign(record,{status:'ready',message:'可导入',entry});accepted.push(entry);fingerprints.add(fingerprint);if(entry.externalId)external.set(key,entry);}
  }catch(error){record.message=error.message;}results.push(record);
 });
 if(l.entries.length+accepted.length>LIMIT)throw Error('导入后流水超过10000条，请先归档账本');if(!results.length)throw Error('CSV没有数据行');
 const errors=results.filter(r=>r.status==='error').length;
 // Fixed key order gives identical preview receipts on both runtimes.
 const digestInput=JSON.stringify({csv:b.csv,mapping:Object.fromEntries(Object.entries(mapping).sort(([a],[b])=>a.localeCompare(b))),source:b.source,accountId:b.accountId,revision:b.revision});
 const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(digestInput)))].map(x=>x.toString(16).padStart(2,'0')).join('');
 return [{rows:results,ready:accepted.length,duplicates:results.filter(r=>r.status==='duplicate').length,errors,canImport:errors===0&&accepted.length>0,digest},accepted];
}
root.WealthLedger={empty,cents,day,validate,expected,report,action,signature,csvPreview};
})(globalThis);
