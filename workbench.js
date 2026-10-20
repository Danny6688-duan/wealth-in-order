/* 独立实现公开规划方法；无外部脚本、跟踪请求或自动交易。 */
(function(root){
'use strict';
const round=n=>Math.round((n+Number.EPSILON)*100)/100;
function num(x,name,min=0,max=1e12){if(typeof x!=='number'||!Number.isFinite(x)||x<min||x>max)throw Error(name+'超出有效范围');return x;}
function project(o){
 const initial=num(o.initial,'起始金额'),monthly=num(o.monthly,'月投入'),years=num(o.years,'年数',1,50),rate=num(o.rate,'年回报假设',-90,100)/100,fee=num(o.fee,'费率',0,10)/100,inflation=num(o.inflation,'通胀',0,20)/100,target=num(o.target,'目标金额');
 if(!Number.isInteger(years))throw Error('年数须为整数');
 // 每月末投入；回报和费用按有效年率转换，不提前把整年投入复利。
 const growth=Math.pow((1+rate)*(1-fee),1/12),grossGrowth=Math.pow(1+rate,1/12);
 let balance=initial,gross=initial,hit=initial>=target?0:null;const rows=[{year:0,balance:round(initial),principal:round(initial),real:round(initial)}];
 for(let m=1;m<=years*12;m++){
  balance=balance*growth+monthly;gross=gross*grossGrowth+monthly;
  if(hit===null&&balance>=target)hit=m;
  if(m%12===0)rows.push({year:m/12,balance:round(balance),principal:round(initial+monthly*m),real:round(balance/Math.pow(1+inflation,m/12))});
 }
 const principal=initial+monthly*years*12;
 return {rows,end:round(balance),principal:round(principal),investmentChange:round(balance-principal),feeDrag:round(gross-balance),real:round(balance/Math.pow(1+inflation,years)),hitMonths:hit};
}
function envelopes(book,summary){
 const p=book.profile,f=summary.strategy.funding;
 const reserve=f.reserveMonthly,goal=f.goalMonthly,annualCatchup=f.annualCatchup;
 const plans=summary.monthlyInvest,buffer=book.policy.monthlyBuffer;
 const rows=[['生活及家庭支出',p.living],['年度支出常规预留',p.annual/12],['应急目标补款',reserve],['近期用款补款',goal],['年度准备额外补款',annualCatchup],['当前定投',plans],['机动储蓄目标',buffer]];
 const assigned=rows.reduce((n,x)=>n+x[1],0),gap=Math.max(0,assigned-p.income),remaining=Math.max(0,p.income-assigned);
 const sustainablePlan=Math.min(p.monthlyInvest,Math.max(0,p.income-p.living-p.annual/12-reserve-goal-annualCatchup-buffer));
 return {rows:rows.map(([name,amount])=>({name,amount:round(amount)})),income:p.income,assigned:round(assigned),gap:round(gap),remaining:round(remaining),cashflowPlanCap:round(sustainablePlan),planAboveCap:round(Math.max(0,plans-sustainablePlan)),datesConfirmed:book.policy.datesConfirmed};
}
function performance(o){
 const start=num(o.start,'期初资产'),end=num(o.end,'期末资产'),deposits=num(o.deposits,'外部入金'),withdrawals=num(o.withdrawals,'外部出金');
 return {change:round(end-start),netContribution:round(deposits-withdrawals),investmentChange:round(end-start-deposits+withdrawals)};
}
function drift(book,summary){
 const q=book.policy,p=book.profile,known=summary.known,unknown=summary.unknown,total=summary.total,target=total*q.equityTarget/100;
 const tentative=target-known;
 if(unknown>.01)return {status:'unknown',delta:null,known,target:round(target),unknown,reason:'底层权益比例未核实，无法判断该增配还是减配。'};
 const f=summary.strategy.funding;
 const need=Math.max(0,(total+Math.max(0,summary.surplus))*q.equityTarget/100-known);
 const buy=f.blockers.length?0:Math.max(0,Math.min(need,f.proposedEquity));
 return {status:Math.abs(tentative)<=total*q.rebalanceBand/100?'within':tentative>0?'under':'over',delta:round(tentative),known,target:round(target),unknown,buy:round(buy),reason:f.blockers.length?'有未解决的家庭资金或风险约束，暂不生成新增权益金额。':'仅计算使用新增资金向目标靠拢的额度，不生成卖出指令。'};
}
function freshness(book,asOf){
 const now=Date.parse(asOf+'T00:00:00Z');if(!Number.isFinite(now))throw Error('基准日期无效');
 const stale=book.assets.filter(a=>a.amount>0&&(!a.updated||!Number.isFinite(Date.parse(a.updated+'T00:00:00Z'))||(now-Date.parse(a.updated+'T00:00:00Z'))/86400000>31));
 return {staleCount:stale.length,amount:round(stale.reduce((n,a)=>n+a.amount,0))};
}
root.WealthWorkbench={project,envelopes,performance,drift,freshness};
})(globalThis);

function workbenchPage(){
 const W=WealthWorkbench,e=W.envelopes(state,analysis),d=W.drift(state,analysis),fresh=W.freshness(state,day()),f=analysis.strategy.funding;
 const initial=Math.max(0,analysis.net-state.profile.reserveTarget-state.profile.annualTarget-state.profile.goalTarget);
 const priorities=[];
 if(e.gap>0)priorities.push(`当前工资分配超出收入¥${money(e.gap)}；先核对定投、目标期限或机动预算。`);
 if(fresh.staleCount)priorities.push(`${fresh.staleCount}项资产超过31天未更新或缺少日期，涉及¥${money(fresh.amount)}，先复核余额。`);
 if(analysis.unknown>0)priorities.push(`先核实¥${money(analysis.unknown)}的底层权益比例；账户数量不能证明已经分散。`);
 if(!state.policy.datesConfirmed)priorities.push('确认年度账单和近期用款日期；以下补款需求仍是假设。');
 if(!priorities.length)priorities.push('已录入规则未发现上述缺口；继续核对单一标的、费用及实际用款。');
 const snapshotRows=[...state.snapshots].sort((a,b)=>a.date.localeCompare(b.date));
 const options='<option value="">手动填写</option>'+snapshotRows.map(x=>`<option value="${esc(x.id)}">${esc(x.date)} · ¥${money(x.total)}</option>`).join('');
 return heading('DECISIONS YOU CAN CHECK','决策工作台','把资金安排、未来假设与实际收益分开核对。所有试算只在本页生效。')+
 `<section class="panel"><div class="panel-heading"><h2>本次先处理什么</h2><span class="badge">账本版本 ${state.revision}</span></div>${priorities.map((x,i)=>`<div class="rule"><span class="badge">${i+1}</span><p>${esc(x)}</p></div>`).join('')}<a class="text-button" href="#strategy">查看完整风险判断 →</a></section>`+
 `<section class="panel section-space"><div class="panel-heading"><h2>工资分配检查</h2><span class="badge ${e.gap?'danger':'good'}">${e.gap?'分配超支':'分配未超收入'}</span></div><p class="subtitle">把每一元安排到具体用途。当前定投与计划补款、机动储蓄同时列出，避免分别看都合理、合在一起超支。</p><div class="table-wrap section-space"><table><thead><tr><th>用途</th><th>月度金额</th></tr></thead><tbody>${e.rows.map(r=>`<tr><td>${esc(r.name)}</td><td>¥${money(r.amount)}</td></tr>`).join('')}<tr><td>合计 / 工资</td><td>¥${money(e.assigned)} / ¥${money(e.income)}</td></tr></tbody></table></div><div class="callout ${e.gap?'amber':''} section-space">${e.gap?`同时满足这些安排，每月还差¥${money(e.gap)}。`:`未分配结余¥${money(e.remaining)}。`}仅按这些资金用途试算，定投现金流额度为¥${money(e.cashflowPlanCap)}，当前超出¥${money(e.planAboveCap)}；还需通过持仓风险检查，这不是买入许可。${!e.datesConfirmed?'用款日期尚未确认，请先复核再调整真实扣款。':''}</div></section>`+
 `<section class="panel section-space"><div class="panel-heading"><h2>目标与复利情景对比</h2><span class="badge">假设试算</span></div><p class="subtitle">起始金额默认用净资产扣除三项目标后的余额，仅是规划基数，不代表可立即投资的现金。月投入默认采用资金用途试算额度，收益默认0%与3%只用于比较。</p><form id="scenario-form" class="section-space"><div class="form-grid policy-grid">${field('起始规划金额','initial',Number(initial.toFixed(2)))}${field('每月末投入','monthly',e.cashflowPlanCap)}${field('比较年数','years',state.policy.horizonYears||5,'number','','min="1" max="50" step="1"')}${field('方案A年回报假设（%）','rateA',0,'number','','min="-90" max="100"')}${field('方案B年回报假设（%）','rateB',3,'number','','min="-90" max="100"')}${field('假设年费用率（%）','fee',0,'number','默认0%不代表实际没有费用。','max="10"')}${field('假设年通胀率（%）','inflation',2,'number','','max="20"')}${field('期末名义金额目标（示例）','target',1000000)}</div><p class="micro">固定有效年回报，月末投入；不含未来提款、税费和收入变化。费用模型：(1+年回报)×(1−年费率)，再换算月度；若填的是已扣费净值回报，费用率请填0，避免重复扣费。通胀只换算购买力，不增加月投入。目标是示例，可自行修改。</p><button class="button primary section-space" type="submit">对比两种情景</button><div id="scenario-error" class="form-error" role="alert"></div></form><div id="scenario-result" class="section-space" aria-live="polite"></div></section>`+
 `<section class="panel section-space"><div class="panel-heading"><h2>配置偏离与新增资金检查</h2><span class="badge">按已录入的目标 ${state.policy.equityTarget}%</span></div><p class="subtitle">目标比例是待复核参数，不能当作已验证的个人推荐；权益比例需包含所有基金和理财的底层敞口。</p><div class="callout ${d.status==='unknown'?'amber':''} section-space">${esc(d.reason)}${d.delta===null?'':` 相对当前目标差额¥${money(d.delta)}（正数为不足、负数为超出）；本月在现有规则下的新增权益试算¥${money(d.buy)}。`}</div><p class="micro section-space">优先用新增储蓄调整；未自动卖出或改变定投。分红计入总回报，不视作独立的无风险收益。</p></section>`+
 `<section class="panel section-space"><div class="panel-heading"><h2>资产增长中，多少来自净入金？</h2><span class="badge">收益归因核对</span></div><p class="subtitle">沿用同一资产范围的两个时点。当前历史没有完整外部资金流，因此不能自动把快照增长当作收益。</p><form id="return-audit-form" class="section-space"><div class="form-grid"><label class="field">选择期初快照<select id="audit-from">${options}</select></label><label class="field">选择期末快照<select id="audit-to">${options}</select></label>${field('期初总资产','start','')}${field('期末总资产','end','')}${field('期间外部入金合计','deposits','')}${field('期间外部出金合计','withdrawals','')}</div><label class="checkbox section-space"><input type="checkbox" name="complete" required>我已核对两个时点范围一致，外部入金和出金完整；没有发生遗漏的账户增删或非现金资产转入转出。</label><p class="micro">同一范围内账户互转不算外部资金流。工资存入算外部入金；留在范围内的分红不重复填入金，转出范围的分红包含在出金中。费用已反映在期末资产中，不再扣一次。金额为0也须明确填写。</p><button class="button primary section-space" type="submit">核对资产变化来源</button><div id="audit-error" class="form-error" role="alert"></div></form><div id="audit-result" class="section-space" aria-live="polite"></div></section>`+
 `<section class="panel section-space"><div class="panel-heading"><h2>借鉴的方法与边界</h2><span class="micro">官方资料调研 · 2026-10-20</span></div><p class="micro">独立实现公开方法，未复制专有代码、界面素材，也未将账本发送给这些平台。尚未实现银行自动连接、Monte Carlo成功概率或时间加权/内部收益率。</p><div class="source-links"><a href="https://www.ynab.com/ynab-method" target="_blank" rel="noopener noreferrer">YNAB · 按用途安排资金 ↗</a><a href="https://projectionlab.com/help/using-what-if" target="_blank" rel="noopener noreferrer">ProjectionLab · What-if对比 ↗</a><a href="https://www.empower.com/tools/portfolio-analysis" target="_blank" rel="noopener noreferrer">Empower · 组合诊断 ↗</a><a href="https://help.portfolio-performance.info/en/concepts/performance/money-weighted/" target="_blank" rel="noopener noreferrer">Portfolio Performance · 外部资金流 ↗</a></div></section>`;
}
function scenarioChart(a,b){
 const all=[...a.rows,...b.rows],max=Math.max(1,...all.map(r=>Math.max(r.balance,r.principal))),last=a.rows.length-1;
 const points=rows=>rows.map((r,i)=>`${40+i/last*500},${220-r.balance/max*185}`).join(' ');
 return `<svg viewBox="0 0 580 260" class="chart" role="img" aria-label="两种假设情景的名义资产变化，非收益预测"><line x1="40" y1="220" x2="540" y2="220"/><text x="40" y="20">最高刻度 ¥${money(max)}</text><text x="40" y="246">起始</text><text x="490" y="246">${last}年</text><polyline points="${points(a.rows)}" style="stroke:#a58243"/><polyline points="${points(b.rows)}" style="stroke:#315e4c"/></svg>`;
}
function showScenario(form){
 const box=$('#scenario-result');box.innerHTML='';$('#scenario-error').textContent='';
 try{
  const data=new FormData(form),read=k=>{if(data.get(k)==='')throw Error('请填写所有试算参数');return Number(data.get(k));};
  const o={initial:read('initial'),monthly:read('monthly'),years:read('years'),fee:read('fee'),inflation:read('inflation'),target:read('target')};
  const a=WealthWorkbench.project({...o,rate:read('rateA')}),b=WealthWorkbench.project({...o,rate:read('rateB')});
  const metrics=[['期末名义金额','end'],['累计本金及投入','principal'],['假设投资增减额','investmentChange'],['费用造成的期末差额','feeDrag'],['按起始购买力折算','real']];
  const warnings=[];if(o.monthly>Math.max(0,analysis.surplus))warnings.push('月投入超过账本真实结余，需要额外资金来源，不能直接执行。');
  if(o.initial>Math.max(0,analysis.net-state.profile.reserveTarget-state.profile.annualTarget-state.profile.goalTarget)+.01)warnings.push('起始金额超过扣除已设目标后的余额，可能占用应急或近期用款。');
  box.innerHTML=`<div class="callout amber">这些曲线仅是固定假设的数学结果，不是预期收益、收益承诺或成功概率；未使用市场回测。${warnings.map(esc).join(' ')}</div>${scenarioChart(a,b)}<p class="micro">金色：方案A；绿色：方案B。期末差额 ¥${money(b.end-a.end)}。</p><div class="table-wrap"><table><thead><tr><th>指标</th><th>方案A（${esc(data.get('rateA'))}%）</th><th>方案B（${esc(data.get('rateB'))}%）</th></tr></thead><tbody>${metrics.map(([label,key])=>`<tr><td>${label}</td><td>¥${money(a[key])}</td><td>¥${money(b[key])}</td></tr>`).join('')}<tr><td>首次达到名义目标</td><td>${a.hitMonths===null?'区间内未达到':a.hitMonths+'个月'}</td><td>${b.hitMonths===null?'区间内未达到':b.hitMonths+'个月'}</td></tr></tbody></table></div><details class="section-space"><summary>查看逐年金额与投入</summary><div class="table-wrap section-space"><table><thead><tr><th>年末</th><th>累计本金</th><th>方案A</th><th>方案B</th></tr></thead><tbody>${a.rows.map((x,i)=>`<tr><td>${x.year}</td><td>¥${money(x.principal)}</td><td>¥${money(x.balance)}</td><td>¥${money(b.rows[i].balance)}</td></tr>`).join('')}</tbody></table></div></details>`;
 }catch(e){$('#scenario-error').textContent=e.message;}
}
function bindWorkbench(){
 const scenario=$('#scenario-form');if(!scenario)return;
 scenario.addEventListener('submit',e=>{e.preventDefault();showScenario(scenario);});showScenario(scenario);
 const form=$('#return-audit-form');
 for(const [id,key] of [['audit-from','start'],['audit-to','end']])$('#'+id).addEventListener('change',e=>{const s=state.snapshots.find(x=>x.id===e.target.value);if(s)form.elements.namedItem(key).value=s.total;$('#audit-result').innerHTML='';});
 form.addEventListener('submit',e=>{e.preventDefault();$('#audit-result').innerHTML='';$('#audit-error').textContent='';try{
  const data=new FormData(form);if(!data.has('complete'))throw Error('请先核对资金流完整性');
  const from=state.snapshots.find(x=>x.id===$('#audit-from').value),to=state.snapshots.find(x=>x.id===$('#audit-to').value);
  if(from&&to&&from.date>=to.date)throw Error('期末快照日期须晚于期初');
  const o={};for(const key of ['start','end','deposits','withdrawals']){if(data.get(key)==='')throw Error('请完整填写金额，零资金流也须填0');o[key]=Number(data.get(key));}
  const r=WealthWorkbench.performance(o);
  $('#audit-result').innerHTML=`<div class="summary-strip"><div><span>资产变化</span><p><b>¥${money(r.change)}</b></p></div><div><span>净入金</span><p><b>¥${money(r.netContribution)}</b></p></div><div><span>剔除资金流后增减额</span><p><b>¥${money(r.investmentChange)}</b></p></div></div><p class="micro section-space">期末 − 期初 − 外部入金 ＋ 外部出金。只核对金额，不展示年化收益率：缺少每笔资金流日期、期间估值和完整交易时，不能可靠计算TWR或XIRR。结果是否代表投资收益，仍取决于资产范围、现金流和估值完整性。</p>`;
 }catch(err){$('#audit-error').textContent=err.message;}});
 for(const node of form.querySelectorAll('input'))node.addEventListener('input',()=>{$('#audit-result').innerHTML='';});
 for(const node of scenario.querySelectorAll('input'))node.addEventListener('input',()=>{$('#scenario-result').innerHTML='<p class="micro">参数已变更，请重新对比。</p>';});
}
