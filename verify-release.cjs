/* Public release integrity check; never reads account data. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),vm=require('node:vm');
const root=path.resolve(process.argv[2]||'.'),manifest=JSON.parse(fs.readFileSync(path.join(root,'release.json'),'utf8'));
assert.equal(manifest.app,'wealth-in-order');assert.match(manifest.version,/^\d+\.\d+\.\d+$/);
for(const [file,hash] of Object.entries(manifest.files)){
 if(file==='index.html')continue;
 assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex'),hash,'Release resource differs: '+file);
}
const context={};vm.runInNewContext(fs.readFileSync(path.join(root,'release.js'),'utf8'),context);assert.equal(context.WealthRelease.sourceHash,manifest.sourceHash);assert.equal(context.WealthRelease.version,manifest.version);
const config={window:{}};vm.runInNewContext(fs.readFileSync(path.join(root,'config.js'),'utf8'),config);const cfg=config.window.WEALTH_CLOUD_CONFIG;
assert.deepEqual(Object.keys(cfg).sort(),['publishableKey','url']);assert.match(cfg.url,/^https:\/\/[a-z0-9-]+\.supabase\.co$/);assert(!cfg.publishableKey.startsWith('sb_secret_'));
if(!cfg.publishableKey.startsWith('sb_publishable_'))assert.equal(JSON.parse(Buffer.from(cfg.publishableKey.split('.')[1],'base64url').toString()).role,'anon');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');const tag=manifest.sourceHash.slice(0,16);
for(const file of Object.keys(manifest.files)){if(file==='index.html')continue;assert(html.includes(file+'?v='+tag),'Missing shared version stamp: '+file);}
assert(!fs.readFileSync(path.join(root,'ledger.js'),'utf8').includes('目前在本地版使用'));assert(fs.readFileSync(path.join(root,'app.js'),'utf8').includes("ledger:['⇄','账户流水']"));
console.log('PASS: v'+manifest.version+' '+tag+' / asset hashes, feature entry, versioned loading, public-only config.');
