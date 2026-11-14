/* 所有保存操作的唯一业务入口；存储适配器只负责读取、事务保存和并发版本检查。 */
(function(root){
'use strict';
const F=root.WealthFinance,L=root.WealthLedger,clone=x=>structuredClone(x),uuid=()=>crypto.randomUUID();
function conflict(message='账本已在其他页面更新，请保留输入、同步最新数据后重试。'){const error=Error(message);error.code='CONFLICT';throw error;}
function equal(a,b){return JSON.stringify(stable(a))===JSON.stringify(stable(b));}
function stable(value){if(Array.isArray(value))return value.map(stable);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])]));return value;}
function snapshot(s,date,note,now){
 L.day(date,now);if(s.snapshots.some(x=>x.date===date))throw Error('当天已有快照，请先删除旧快照再记录');
 const a=F.analyze(s,now);s.snapshots.push({id:uuid(),date,total:a.total,net:a.net,liabilities:s.profile.liabilities,equityKnown:a.known,equityUnknown:a.unknown,note:note??'',assetBalances:s.assets.map(({id,name,category,amount})=>({id,name,category,amount}))});
}
async function apply(input,path,b,now=F.today()){
 const old=F.upgrade(input);if(!b||typeof b!=='object'||!Number.isInteger(b.revision)||b.revision!==old.revision)conflict();
 let next=clone(old),source='edit';
 if(path==='/api/state'||path==='/api/import'){
  if(!b.state||typeof b.state!=='object'||Array.isArray(b.state))throw Error('备份格式错误');
  next=F.upgrade(b.state);
  if(path==='/api/state'){
   if(b.state.logicVersion!==2)conflict('策略逻辑已升级，请刷新页面后再保存。');
   if(!equal(next.ledger,old.ledger))conflict('账户流水已更新，请刷新；请通过账户流水页面修改记录。');
   if(!equal(next.snapshots,old.snapshots))throw Error('历史快照请通过快照功能修改');
   if(!equal(next.assetChanges,old.assetChanges)||next.assetChangesDropped!==old.assetChangesDropped)throw Error('资产变更记录由系统生成，请刷新后再保存');
  }
  source=path==='/api/import'?'restore':'edit';
 }else if(path==='/api/ledger/action'){
  L.action(next,b,now);source=b.action==='reconcile'?'reconcile':'ledger';
 }else if(path==='/api/ledger/preview'||path==='/api/ledger/import'){
  const [preview,entries]=await L.csvPreview(next,b,now);if(path==='/api/ledger/preview')return {preview};
  if(!preview.canImport||b.digest!==preview.digest)throw Error('请先预览并解决所有错误；文件或映射改变后须重新预览。');
  next.ledger.entries.push(...entries);source='csv-import';
 }else if(path==='/api/snapshot')snapshot(next,b.date,b.note,now);
 else if(path==='/api/delete-snapshot')next.snapshots=next.snapshots.filter(x=>x.id!==b.id);
 else if(path==='/api/valuation'){
  if(b.date!==now)throw Error('批量更新仅支持今天；历史数据请核实后另存历史快照');
  if(!b.amounts||typeof b.amounts!=='object'||!equal(Object.keys(b.amounts).sort(),next.assets.map(a=>a.id).sort()))throw Error('资产列表已改变，请刷新后再录入');
  for(const a of next.assets){a.amount=b.amounts[a.id];a.updated=now;}F.validate(next);snapshot(next,now,b.note,now);source='valuation';
 }else{const error=Error('未找到接口');error.code='NOT_FOUND';throw error;}
 F.validate(next);return {state:next,source};
}
function audit(next,input,source){
 const old=root.WealthFinance.upgrade(input),prev=new Map(old.assets.map(a=>[a.id,a])),cur=new Map(next.assets.map(a=>[a.id,a]));
 const relevant=['name','amount','category','equity','purpose','liquid','maturity','updated','role','feeRate','exposureGroup','note','aggregate'];
 for(const key of [...new Set([...prev.keys(),...cur.keys()])].sort()){
  const a=prev.get(key),b=cur.get(key);if(a&&b&&relevant.every(k=>equal(a[k]??null,b[k]??null)))continue;
  const before=a?.amount??0,after=b?.amount??0;
  next.assetChanges.push({id:uuid(),assetId:key,name:(b||a).name,savedAt:new Date().toISOString(),source,kind:!a?'added':!b?'removed':'updated',before,after,delta:Math.round((after-before+Number.EPSILON)*100)/100});
 }
 const excess=Math.max(0,next.assetChanges.length-10000);next.assetChangesDropped+=excess;next.assetChanges=next.assetChanges.slice(-10000);return next;
}
root.WealthEngine={apply,audit,equal};
})(globalThis);
