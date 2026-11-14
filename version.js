/* 应用版本与账本修订号分开显示；发现新发布时提示刷新，保留未保存输入。 */
(function(){
'use strict';
const release=globalThis.WealthRelease;
const el=document.getElementById('app-version');if(el)el.textContent='财富有序 v'+release.version;
let checking=false;
async function check(){
 if(checking||document.hidden)return;checking=true;
 try{
  const url=new URL('release.json',location.href);url.searchParams.set('check',Date.now());
  const response=await fetch(url,{cache:'no-store'});if(!response.ok)return;const latest=await response.json();
  if((latest.sourceHash===release.sourceHash&&latest.version===release.version)||latest.app!==release.app)return;
  let button=document.getElementById('app-update');if(button)return;
  button=document.createElement('button');button.id='app-update';button.className='button small';button.textContent='有新版本，刷新更新';
  button.onclick=()=>{if(globalThis.WealthHasUnsaved?.()&&!confirm('当前有未保存输入，请先保留。确定刷新到新版本吗？'))return;location.reload();};
  document.querySelector('.header-right')?.prepend(button);
 }catch{}finally{checking=false;}
}
window.addEventListener('focus',check);document.addEventListener('visibilitychange',check);setInterval(check,60000);
})();
