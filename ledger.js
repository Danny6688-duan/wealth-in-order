/* 独立实现账户流水工作流；全部数据留在本地服务。 */
'use strict';
const ledgerKinds={income:'收入',expense:'支出',transfer:'转账'};
let ledgerFilters={month:'',account:'',kind:'',search:''},ledgerOffset=0;
let csvDraft=null;
const ledgerAccounts=()=>analysis.ledger?.accounts||[];
const ledgerNames=()=>Object.fromEntries(ledgerAccounts().map(a=>[a.id,a.name]));
function ledgerSelect(label,name,options,value=''){
 return `<label class="field">${esc(label)}<select name="${name}" aria-label="${esc(label)}">${Object.entries(options).map(([k,v])=>`<option value="${esc(k)}" ${k===value?'selected':''}>${esc(v)}</option>`).join('')}</select></label>`;
}
function ledgerPage(){
 if(!state.ledger||!analysis.ledger)return heading('Account ledger','账户流水','请刷新页面以加载完整账本。');
 const l=state.ledger,accounts=ledgerAccounts(),names=ledgerNames(),summary=analysis.ledger;
 let rows=l.entries.filter(e=>(!ledgerFilters.month||e.date.startsWith(ledgerFilters.month))&&(!ledgerFilters.account||e.accountId===ledgerFilters.account||e.toAccountId===ledgerFilters.account)&&(!ledgerFilters.kind||e.kind===ledgerFilters.kind)&&(!ledgerFilters.search||[e.note,e.category,e.externalId,e.source,names[e.accountId],names[e.toAccountId]].join(' ').toLowerCase().includes(ledgerFilters.search.toLowerCase()))).sort((a,b)=>b.date.localeCompare(a.date)||b.id.localeCompare(a.id));
 const count=rows.length;ledgerOffset=Math.min(ledgerOffset,Math.max(0,Math.floor((count-1)/100)*100));rows=rows.slice(ledgerOffset,ledgerOffset+100);
 const details=accounts.map(a=>`<article class="ledger-account"><div class="panel-heading"><div><span class="eyebrow">现金 / 存款</span><h2>${esc(a.name)}</h2></div><span class="badge ${Math.abs(a.difference)<.005?'good':'warn'}">${Math.abs(a.difference)<.005?'余额一致':'待核对'}</span></div><div class="ledger-balance">¥${money(a.observed)}</div><p class="micro">实际余额 · ${esc(a.asOf)}</p><dl class="ledger-equation"><div><dt>${esc(a.openingDate)} 期初</dt><dd>¥${money(a.openingBalance)}</dd></div><div><dt>余额日账面应有</dt><dd>¥${money(a.expected)}</dd></div><div class="ledger-difference"><dt>实际 − 账面</dt><dd class="${Math.abs(a.difference)<.005?'':'negative'}">${a.difference>0?'+':''}¥${money(a.difference)}</dd></div></dl><p class="micro">截至今天账面 ¥${money(a.expectedToday)}${a.laterEntries?` · ${a.laterEntries} 笔晚于实际余额日期`:''}</p><p class="micro">期初依据：${esc(a.source)}</p><div class="actions section-space"><button class="button small primary" data-action="ledger-reconcile" data-id="${esc(a.id)}">核对实际余额</button><button class="text-button" data-action="ledger-anchor" data-id="${esc(a.id)}">修改期初</button><button class="text-button danger" data-action="ledger-unlink" data-id="${esc(a.id)}">移除关联</button></div></article>`).join('');
 const records=rows.map(e=>`<tr><td>${esc(e.date)}</td><td><span class="badge ${e.kind==='income'?'good':''}">${ledgerKinds[e.kind]}</span></td><td>${esc(names[e.accountId])}${e.kind==='transfer'?` → ${esc(names[e.toAccountId])}`:''}</td><td class="amount">${e.kind==='income'?'+':e.kind==='expense'?'−':''}${money(e.amount)}</td><td>${esc(e.category)||'未分类'}</td><td>${esc(e.note)||'—'}<small class="ledger-source">${esc(e.source)}${e.externalId?' · '+esc(e.externalId):''}</small></td><td><button class="text-button danger" data-action="ledger-delete" data-id="${esc(e.id)}">删除</button></td></tr>`).join('');
 const audit=[...l.reconciliations].reverse().slice(0,20).map(r=>`<tr><td>${esc(r.date)}</td><td>${esc(names[r.accountId])}</td><td>¥${money(r.expected)}</td><td>¥${money(r.observed)}</td><td>¥${money(r.observed-r.expected)}</td><td>${esc(r.source)}${r.note?' · '+esc(r.note):''}</td></tr>`).join('');
 return heading('Every balance has a story','账户流水','从期初余额到每一笔变动，把账核对清楚。',button('关联现有账户','ledger-anchor')+button('导入 CSV','ledger-import')+button('＋ 记录流水','ledger-entry',true))+
 `<div class="metrics">${metric('已关联账户',String(accounts.length),'关联现有资产，不另加一份余额',true)}${metric('本月流水收入',currency(summary.income),'已计入收支页实际收入')}${metric('本月流水支出',currency(summary.expense),'已计入收支页实际支出')}${metric('本月内部转账',currency(summary.transfer),'每次转账记一笔，收入与消费均不增加')}</div>`+
 `<div class="callout ledger-intro">期初余额指所选日期开始前的余额，该日期起的流水参与计算。流水用于核账；实际资产余额在“核对实际余额”时由你确认。旧收支记录不自动补入账户，请勿将同一笔收支再次录入或导入。</div>`+
 `<div class="ledger-account-grid section-space">${details||'<section class="panel empty">先在“资产与持仓”拆分现金或存款账户，再点击“关联现有账户”。账户余额仍只在总资产中计算一次。</section>'}</div>`+
 `<section class="panel section-space"><div class="panel-heading"><h2>流水明细</h2><span class="micro">共 ${l.entries.length} 笔 · 符合筛选 ${count} 笔</span></div><form id="ledger-filters" class="ledger-filters"><label class="field">月份<input type="month" name="month" aria-label="流水月份" value="${esc(ledgerFilters.month)}"></label>${ledgerSelect('账户','account',{'':'全部账户',...names},ledgerFilters.account)}${ledgerSelect('类型','kind',{'':'全部类型',...ledgerKinds},ledgerFilters.kind)}<label class="field">搜索<input name="search" aria-label="搜索流水" maxlength="100" value="${esc(ledgerFilters.search)}" placeholder="备注、分类、来源"></label><button class="button">筛选</button><button class="text-button" type="button" data-action="ledger-reset">清除</button></form><div class="table-wrap"><table><thead><tr><th>日期</th><th>类型</th><th>账户</th><th>金额（元）</th><th>分类</th><th>备注 / 来源</th><th>操作</th></tr></thead><tbody>${records||'<tr><td colspan="7" class="empty">暂无符合条件的流水。</td></tr>'}</tbody></table></div><div class="actions section-space"><button class="button small" data-action="ledger-prev" ${ledgerOffset===0?'disabled':''}>上一页</button><span class="micro">${count?ledgerOffset+1:0}—${Math.min(ledgerOffset+100,count)} / ${count}</span><button class="button small" data-action="ledger-next" ${ledgerOffset+100>=count?'disabled':''}>下一页</button></div></section>`+
 `<section class="panel section-space"><div class="panel-heading"><h2>实际余额核对记录</h2><span class="micro">最近20次 · 保留核对当时的结果</span></div><div class="table-wrap"><table><thead><tr><th>日期</th><th>账户</th><th>当时账面</th><th>实际余额</th><th>当时差额</th><th>依据与说明</th></tr></thead><tbody>${audit||'<tr><td colspan="6" class="empty">核对实际余额后，依据与差额会记录在这里。</td></tr>'}</tbody></table></div></section>`;
}
async function ledgerAction(body){
 if(saving)throw Error('上一笔保存尚未完成，请稍后。');
 saving=true;try{accept(await api('/api/ledger/action',{...body,revision:state.revision}));render();}finally{saving=false;}
}
function ledgerAnchor(key){
 const old=ledgerAccounts().find(a=>a.id===key),used=new Set(ledgerAccounts().map(a=>a.assetId));
 const assets=state.assets.filter(a=>a.category==='cash'&&!a.aggregate&&(!used.has(a.id)||a.id===old?.assetId));
 if(!assets.length){toast('请先在资产与持仓中添加或拆分现金、存款账户。');return;}
 const options=Object.fromEntries(assets.map(a=>[a.id,a.name]));
 openEditor(old?'修改账户期初':'关联现有现金账户',`<div class="form-grid">${ledgerSelect('关联资产','assetId',options,old?.assetId||assets[0].id)}${field('期初日期','openingDate',old?.openingDate||assets[0].updated,'date','该日开始前的余额；该日期起的流水参与计算。','max="'+day()+'"')}${field('期初余额（元）','openingBalance',old?.openingBalance??'')}<label class="field">期初余额依据<input name="source" aria-label="期初余额依据" maxlength="200" value="${esc(old?.source||'')}" placeholder="如：银行11月1日期初账单" required></label></div><div class="callout section-space">这里关联现有资产，不增加总资产。期初余额需与流水起始日匹配；不要用今天的余额冒充月初余额。修改期初会重新计算当前对账差额。</div>`,async data=>{await ledgerAction({action:'account',id:old?.id,assetId:data.get('assetId'),openingDate:data.get('openingDate'),openingBalance:Number(data.get('openingBalance')),source:data.get('source')});toast('账户期初已保存');});
 if(old)$('#dialog-fields select[name="assetId"]').disabled=true;
 else $('#dialog-fields select[name="assetId"]').addEventListener('change',e=>{$('#dialog-fields input[name="openingDate"]').value=assets.find(a=>a.id===e.target.value).updated;});
 // disabled controls are omitted from FormData; keep the original relationship explicit.
 if(old){const fn=submitEditor;submitEditor=async data=>{data.set('assetId',old.assetId);await fn(data);};}
}
function ledgerEntry(){
 const names=ledgerNames();if(!Object.keys(names).length){toast('请先关联现金或存款账户。');return;}
 openEditor('记录账户流水',`<div class="form-grid">${field('发生日期','date',day(),'date','','max="'+day()+'"')}${ledgerSelect('流水类型','kind',ledgerKinds,'expense')}${ledgerSelect('发生账户 / 转出账户','accountId',names)}<div id="ledger-target" hidden>${ledgerSelect('转入账户','toAccountId',{'':'请选择另一账户',...names})}</div>${field('流水金额（元）','amount','','number','','min="0.01"')}<label class="field">分类<input name="category" aria-label="流水分类" maxlength="100" placeholder="如：餐饮、工资、交通"></label><label class="field full">备注<input name="note" aria-label="流水备注" maxlength="500"></label></div><div class="callout section-space">内部转账只记一次，双方账户一起核算。投资申购、赎回和负债还款暂不在此录入；也不要再次记录已在收支页登记的同一笔收入或消费。</div>`,async data=>{await ledgerAction({action:'entry',date:data.get('date'),kind:data.get('kind'),amount:Number(data.get('amount')),accountId:data.get('accountId'),toAccountId:data.get('kind')==='transfer'?data.get('toAccountId'):'',category:data.get('category'),note:data.get('note')});toast('流水已保存，收支统计已更新');});
 $('#dialog-fields select[name="kind"]').addEventListener('change',e=>{$('#ledger-target').hidden=e.target.value!=='transfer';});
}
function ledgerReconcile(key){
 const a=ledgerAccounts().find(a=>a.id===key);if(!a)return;
 openEditor('核对实际余额',`<p class="subtitle">${esc(a.name)} · 截至今天账面应有 ¥${money(a.expectedToday)}。</p><div class="form-grid section-space">${field('今天实际余额（元）','observed',a.observed)}<label class="field">实际余额依据<input name="source" aria-label="实际余额依据" maxlength="200" placeholder="如：银行App今日可用余额" required></label><label class="field full">差额说明<input name="note" aria-label="差额说明" maxlength="500" placeholder="如：部分现金消费尚未录入"></label></div><div class="callout section-space">确认后将更新关联资产的余额与日期，重新计算资金规划，并保留本次差额。不会添加收入、消费或虚构调账流水。</div>`,async data=>{await ledgerAction({action:'reconcile',accountId:key,date:day(),observed:Number(data.get('observed')),source:data.get('source'),note:data.get('note')});toast('实际余额已更新，对账差额已保留');},'确认实际余额');
}
function csvHeaders(raw){
 // Only discover the header here; the server parses and validates every data row.
 let cells=[],value='',quoted=false;
 for(let i=0;i<raw.length;i++){const c=raw[i];if(c==='"'){if(quoted&&raw[i+1]==='"'){value+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted){cells.push(value);value='';}else if((c==='\n'||c==='\r')&&!quoted){cells.push(value);return cells;}else value+=c;}
 if(quoted)throw Error('CSV表头引号未闭合');cells.push(value);return cells;
}
function ledgerImport(){
 const names=ledgerNames();if(!Object.keys(names).length){toast('请先关联现金或存款账户。');return;}
 csvDraft=null;
 openEditor('导入账户 CSV',`<p class="subtitle">每次导入一个账户的账单。支持 UTF-8 或 GB18030 编码，以逗号分隔。请先移除账单说明行，保留表头和流水；原始CSV在当前设备解析，确认后将流水保存到账本。</p><div class="form-grid section-space">${ledgerSelect('导入账户','accountId',names)}<label class="field">账单来源<input name="source" aria-label="账单来源" maxlength="100" placeholder="如：招商银行储蓄卡" required></label>${ledgerSelect('文件编码','encoding',{'utf-8':'UTF-8','gb18030':'GB18030 / GBK'})}<label class="field">账单文件<input id="ledger-csv-file" type="file" accept=".csv,text/csv" aria-label="账单文件" required></label></div><div id="ledger-csv-mapping"></div><div id="ledger-csv-preview" aria-live="polite"></div><div class="callout section-space">金额填正数，类型填收入、支出或转账。转账只导入转出方一笔，另一方不再重复导入。建议映射外部流水ID；没有ID时，完全相同的日期、金额、类型、账户、分类和备注将被视为重复。</div><button type="button" class="button section-space" id="ledger-preview-button">预览并校验</button>`,async()=>{
 if(!csvDraft?.digest)throw Error('请先选择文件、映射列并完成预览。');
 const payload=csvDraft;accept(await api('/api/ledger/import',payload));csvDraft=null;render();toast('账单已导入；重复记录已跳过');
 },'确认导入');
 const submit=$('#dialog-submit');submit.disabled=true;
 let generation=0;
 const invalidate=()=>{generation++;csvDraft=null;submit.disabled=true;$('#ledger-csv-preview').textContent='文件或设置变动后，请重新预览。';};
 $('#dialog-fields').oninput=e=>{if(e.target.id!=='ledger-csv-file')invalidate();};$('#dialog-fields').onchange=e=>{if(e.target.id!=='ledger-csv-file'&&e.target.name!=='encoding')invalidate();};
 let raw='';
 async function readFile(){
  const ticket=generation;
  raw='';$('#ledger-csv-mapping').innerHTML='';const f=$('#ledger-csv-file').files[0];if(!f)return;
  if(f.size>2*1024*1024)throw Error('CSV文件不能超过2MB');
  const decoded=new TextDecoder($('#dialog-fields select[name="encoding"]').value,{fatal:true}).decode(await f.arrayBuffer()).replace(/^\uFEFF/,'');
  if(ticket!==generation)return;raw=decoded;
  const headers=csvHeaders(raw);if(headers.length>100||new Set(headers).size!==headers.length||headers.some(h=>!h))throw Error('CSV表头不能为空、重复或超过100列');
  const aliases={date:['date','日期','交易日期'],kind:['kind','类型','收支类型','收/支'],amount:['amount','金额','金额(元)','金额（元）'],toAccount:['toAccount','转入账户'],category:['category','分类','交易分类'],note:['note','备注','商品说明'],externalId:['id','externalId','流水号','交易单号']};
  const labels={date:'日期列',kind:'类型列',amount:'金额列',toAccount:'转入账户列',category:'分类列',note:'备注列',externalId:'外部流水ID列'};
  $('#ledger-csv-mapping').innerHTML='<h3 class="section-space">核对列映射</h3><div class="form-grid">'+Object.entries(labels).map(([key,label])=>ledgerSelect(label,'map-'+key,{'':'不导入 / 请选择',...Object.fromEntries(headers.map(h=>[h,h]))},headers.find(h=>aliases[key].includes(h))||'')).join('')+'</div>';
 }
 const readSafe=safe(async()=>{invalidate();try{await readFile();}catch(e){raw='';$('#ledger-csv-mapping').innerHTML='';throw e;}});
 $('#ledger-csv-file').addEventListener('change',readSafe);$('#dialog-fields select[name="encoding"]').addEventListener('change',readSafe);
 $('#ledger-preview-button').onclick=safe(async()=>{
  if(!raw)throw Error('请先选择可读取的CSV文件。');
  const button=$('#ledger-preview-button');button.disabled=true;submit.disabled=true;csvDraft=null;
  const ticket=generation;
  const data=new FormData($('#editor-form'));const mapping=Object.fromEntries(['date','kind','amount','toAccount','category','note','externalId'].map(k=>[k,data.get('map-'+k)||'']));
  const payload={csv:raw,mapping,accountId:data.get('accountId'),source:data.get('source'),revision:state.revision};
  try{const {preview:p}=await api('/api/ledger/preview',payload);if(ticket!==generation)return;csvDraft=p.canImport?{...payload,digest:p.digest}:null;
   $('#ledger-csv-preview').innerHTML=`<div class="callout ${p.errors?'amber':''} section-space">可导入 ${p.ready} 笔 · 重复跳过 ${p.duplicates} 笔 · 错误 ${p.errors} 笔${p.errors?'。请修正文件后重新预览，整批尚未写入。':''}</div><div class="table-wrap"><table><thead><tr><th>行</th><th>状态</th><th>日期 / 类型</th><th>金额</th><th>结果</th></tr></thead><tbody>${p.rows.slice(0,100).map(r=>`<tr><td>${r.row}</td><td>${{ready:'可导入',duplicate:'重复',error:'错误'}[r.status]}</td><td>${r.entry?esc(r.entry.date)+' / '+ledgerKinds[r.entry.kind]:'—'}</td><td>${r.entry?money(r.entry.amount):'—'}</td><td>${esc(r.message)}</td></tr>`).join('')}</tbody></table></div>${p.rows.length>100?'<p class="micro">预览显示前100行，统计与校验覆盖全部行。</p>':''}`;
   submit.disabled=!p.canImport;
  }finally{button.disabled=false;}
 });
}
function bindLedger(){
 bind('ledger-anchor',ledgerAnchor);bind('ledger-entry',ledgerEntry);bind('ledger-reconcile',ledgerReconcile);bind('ledger-import',ledgerImport);
 bind('ledger-delete',key=>confirmation('删除这笔账户流水','删除后当前对账差额与收支统计会重新计算。对账历史保留当时的结果。再次导入原账单时，这笔记录可能重新出现。',async()=>{await ledgerAction({action:'delete-entry',id:key});toast('流水已删除');}));
 bind('ledger-unlink',key=>confirmation('移除账户关联','只有没有流水、没有对账历史的账户可移除。资产记录及余额仍然保留。',async()=>{await ledgerAction({action:'delete-account',id:key});toast('账户关联已移除');}));
 bind('ledger-reset',()=>{ledgerFilters={month:'',account:'',kind:'',search:''};ledgerOffset=0;render();});
 bind('ledger-prev',()=>{ledgerOffset=Math.max(0,ledgerOffset-100);render();});bind('ledger-next',()=>{ledgerOffset+=100;render();});
 const form=$('#ledger-filters');if(form)form.addEventListener('submit',e=>{e.preventDefault();ledgerFilters=Object.fromEntries(new FormData(form));ledgerOffset=0;render();});
}
