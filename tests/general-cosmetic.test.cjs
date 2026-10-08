const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const tick=()=>new Promise(r=>setImmediate(r));
function harness({host='heye.kr',href,missingPolicy=false,failedInsert=false,bundled=false,failFetch=false,importedRules,cosmeticPolicies}={}) {
  const settings={globalEnabled:true,disabledSites:[]}, css=[], messages=[], listeners={}, root={dataset:{}};
  const c=vm.createContext({URL,console});
  c.window=c;c.location={hostname:host,href:href||'https://'+host+'/board/index.html'};
  c.__YAS_COSMETIC_POLICY_V3__=cosmeticPolicies||JSON.parse(read('filters/cosmetic-policy.json'));
  c.document={documentElement:root};c.CSS={supports:s=>!s.includes(':unsupported')};
  c.postMessage=m=>messages.push(m);
  c.chrome={storage:{local:{get:async d=>({...d,...settings})},onChanged:{addListener:f=>listeners.changed=f}},runtime:{id:'own-extension',onMessage:{addListener:f=>listeners.message=f},sendMessage:async m=>{
    if(m.type==='YAS_FRAME_CONTEXT')return {host};
    if(failedInsert&&!m.remove)return {ok:false,error:'CSS rejected'};
    css.push(m);return {ok:true};
  },getURL:p=>'chrome-extension://own/'+p}};
  let fetches=0;
  c.fetch=async()=>{fetches++;if(failFetch)throw Error('generic filters unavailable');return {ok:true,json:async()=>importedRules||[
    {domains:[],selector:'.generic-ad',exception:false},
    {domains:[],selector:'.keep-normal',exception:false},
    {domains:['heye.kr'],selector:'.keep-normal',exception:true},
    {domains:[],selector:':unsupported',exception:false},
  ]}};
  if(bundled) {
    Object.defineProperty(c,'__YAS_GENERAL_POLICY_V3__',{get(){throw Error('cross-file policy lookup forbidden')}});
    Object.defineProperty(c,'__YAS_GENERAL_SITE_RULES_V3__',{get(){throw Error('cross-file site lookup forbidden')}});
    Object.defineProperty(c,'__YAS_COSMETIC_POLICY_V3__',{get(){throw Error('cross-file cosmetic policy lookup forbidden')}});
    vm.runInContext(read('general/content-bundle.js'),c);
  } else {
    if(!missingPolicy)vm.runInContext(read('general/policy.js'),c);
    vm.runInContext(read('general/site-rules.js'),c);
    vm.runInContext(read('general/cosmetic.js'),c);
  }
  return {c,css,messages,listeners,settings,status:()=>JSON.parse(root.dataset.yasGeneralStatus),fetches:()=>fetches,recover(){failedInsert=false}};
}
test('named policy remains available when script-specific Symbol registries differ',()=>{
  const shared={};
  const one=vm.createContext({globalThis:shared,URL,Symbol:{for:name=>Symbol(name)}});
  vm.runInContext(read('general/policy.js'),one);
  const two=vm.createContext({globalThis:shared,Symbol:{for:name=>Symbol(name)}});
  assert.equal(vm.runInContext('typeof globalThis.__YAS_GENERAL_POLICY_V3__.domainRule',two),'function');
});
test('cosmetic applies real compiled site selectors and reports readiness',async()=>{
  const h=harness();await tick();
  assert.equal(h.status().error,null);assert.equal(h.status().ready,true);assert.equal(h.status().applied,true);
  assert.equal(h.status().siteSelectors,8);assert.equal(h.status().unsupportedSelectors,0);
  const css=h.css.find(m=>!m.remove).css;
  assert.match(css,/#site_right_banner_item/);assert.match(css,/\.toast-banner/);assert.doesNotMatch(css,/\.generic-ad/);
  assert.doesNotMatch(css,/\.keep-normal|#top_right|\.post-media/);
});
test('compatibility selectors do not leak to unrelated or lookalike domains',async()=>{
  for(const host of ['news.example.org','heye.kr.example.org','notheye.kr']) {
    const h=harness({host});await tick();assert.equal(h.status().siteSelectors,0);
    assert.doesNotMatch(h.css.find(m=>!m.remove).css,/#site_right_banner_item/);
  }
  const h=harness({host:'www.heye.kr'});await tick();assert.equal(h.status().siteSelectors,8);
});
test('pause removes existing styles and resume restores them',async()=>{
  const h=harness();await tick();h.settings.disabledSites=['heye.kr'];h.listeners.changed({},'local');await tick();
  assert.equal(h.status().enabled,false);assert.equal(h.status().applied,false);assert.equal(h.css.at(-1).remove,true);
  assert.equal(h.messages.at(-1).enabled,false);
  h.settings.disabledSites=[];h.listeners.changed({},'local');await tick();
  assert.equal(h.status().applied,true);assert.equal(h.css.at(-1).remove,false);
});
test('banner and popup categories update independently while provider pause retains both',async()=>{
  const h=harness();await tick();
  h.settings.siteFeatures={'heye.kr':{providers:false,banners:true,popups:true}};h.listeners.changed({},'local');await tick();
  assert.equal(h.status().applied,true);assert.equal(h.messages.at(-1).enabled,true);assert.equal(h.status().features.providers,false);
  h.settings.siteFeatures['heye.kr'].banners=false;h.listeners.changed({},'local');await tick();
  assert.equal(h.status().applied,false);assert.equal(h.messages.at(-1).enabled,true);
  h.settings.siteFeatures['heye.kr']={providers:true,banners:true,popups:false};h.listeners.changed({},'local');await tick();
  assert.equal(h.status().applied,true);assert.equal(h.messages.at(-1).enabled,false);
});
test('missing policy is reported explicitly without an uncaught domainRule error',()=>{
  const h=harness({missingPolicy:true});assert.match(h.status().error,/공통 광고 정책/);assert.equal(h.status().applied,false);
});
test('CSS failures are visible and a later successful update clears them',async()=>{
  const h=harness({failedInsert:true});await tick();assert.equal(h.status().error,'CSS rejected');assert.equal(h.status().applied,false);
  h.recover();h.listeners.changed({},'local');await tick();assert.equal(h.status().error,null);assert.equal(h.status().applied,true);
});
test('popup diagnostics respond only to the extension sender',async()=>{
  const h=harness();await tick();const replies=[];
  h.listeners.message({type:'YAS_GENERAL_STATUS'},{id:'other'},r=>replies.push(r));assert.equal(replies.length,0);
  h.listeners.message({type:'YAS_GENERAL_STATUS'},{id:'own-extension'},r=>replies.push(r));assert.equal(replies[0].applied,true);
});
test('native popup has an explicit intrinsic minimum without a viewport-width feedback rule',()=>{
  const css=read('general/popup.css');assert.match(css,/html, body[^}]*width: 400px; min-width: 400px;/);
  assert.doesNotMatch(css,/width\s*:\s*[\d.]+vw/);assert.match(css,/word-break: keep-all/);
});
test('production content bundle works with all old shared-policy lookups forbidden',async()=>{
  const h=harness({bundled:true});await tick();
  assert.equal(h.status().error,null);assert.equal(h.status().applied,true);assert.equal(h.status().mode,'site-only');
  assert.equal(h.status().selectors,13);assert.equal(h.status().siteSelectors,8);assert.equal(h.fetches(),0);
});
test('compatibility ad-slot CSS applies even when the generic cosmetic file cannot load',async()=>{
  const h=harness({bundled:true,failFetch:true});await tick();assert.equal(h.status().applied,true);assert.equal(h.fetches(),0);
});
test('other sites retain generic cosmetics in the production bundle',async()=>{
  const h=harness({host:'news.example.org',bundled:true});await tick();
  assert.equal(h.status().mode,'general');assert.equal(h.status().siteSelectors,0);assert.equal(h.fetches(),1);
  assert.match(h.css.find(m=>!m.remove).css,/\.generic-ad/);
});
test('bundled compatibility rules pause and resume without any navigation or reload',async()=>{
  const h=harness({bundled:true});await tick();h.settings.globalEnabled=false;h.listeners.changed({},'local');await tick();
  assert.equal(h.status().applied,false);h.settings.globalEnabled=true;h.listeners.changed({},'local');await tick();
  assert.equal(h.status().applied,true);
  assert.doesNotMatch(read('general/content-bundle.js'),/location\.(?:reload|replace|assign)|location\.(?:href|pathname)\s*=/);
});
const commonRules=[
  {domains:[],selector:'.generic-ad',exception:false},
  {domains:['~excluded.example.org'],selector:'.negative-only-ad',exception:false},
  {domains:['accounts.google.com','news.example.org'],selector:'.specific-ad',exception:false},
];
test('official generichide exceptions suppress generic names but keep specific ads',async()=>{
  const h=harness({host:'accounts.google.com',bundled:true,importedRules:commonRules});await tick();
  assert.equal(h.status().genericAllowed,false);assert.equal(h.status().specificAllowed,true);
  assert.ok(h.status().matchedExceptions>0);assert.equal(h.status().skippedSelectors,2);
  const applied=h.css.find(m=>!m.remove).css;
  assert.doesNotMatch(applied,/\.generic-ad|\.negative-only-ad/);assert.match(applied,/\.specific-ad/);
});
test('verified provider creatives retain explicit scope under generichide and honor selector exceptions',async()=>{
  const selector='a[href]:has(img[src*="/known-ad.gif"])';
  const rule={domains:[],selector,exception:false,verifiedProvider:true};
  const h=harness({host:'accounts.google.com',importedRules:[rule]});await tick();
  assert.equal(h.status().genericAllowed,false);assert.ok(h.css.find(m=>!m.remove).css.includes(selector));
  const allowed=harness({host:'accounts.google.com',importedRules:[rule,{...rule,exception:true}]});await tick();
  assert.ok(!allowed.css.find(m=>!m.remove).css.includes(selector));
});
test('generic hiding remains active on unrelated news sites, including negative-only rules',async()=>{
  const h=harness({host:'news.example.org',bundled:true,importedRules:commonRules});await tick();
  assert.equal(h.status().genericAllowed,true);assert.equal(h.status().specificAllowed,true);
  assert.equal(h.status().matchedExceptions,0);assert.equal(h.status().skippedSelectors,0);
  const applied=h.css.find(m=>!m.remove).css;
  assert.match(applied,/\.generic-ad/);assert.match(applied,/\.negative-only-ad/);assert.match(applied,/\.specific-ad/);
});
test('URL-scoped list exception does not suppress other pages or lookalike hosts',async()=>{
  const search=harness({host:'www.google.co.kr',href:'https://www.google.co.kr/search?q=ads',bundled:true,importedRules:commonRules});await tick();
  assert.equal(search.status().genericAllowed,false);
  for(const [host,href] of [['www.google.co.kr','https://www.google.co.kr/about'],['google.example.org','https://google.example.org/search?q=ads'],['example.org','https://example.org/www.google.co.kr/search?q=ads']]) {
    const h=harness({host,href,bundled:true,importedRules:commonRules});await tick();assert.equal(h.status().genericAllowed,true);
  }
});
test('specific hide policy keeps generic list rules, elemhide removes all cosmetic styles',async()=>{
  const rule={regex:'^https://news\\.example\\.org/',flags:'i',domains:[],modes:['specific']};
  const h=harness({host:'news.example.org',importedRules:commonRules,cosmeticPolicies:[rule]});await tick();
  assert.equal(h.status().specificAllowed,false);assert.match(h.css.find(m=>!m.remove).css,/\.generic-ad/);
  assert.doesNotMatch(h.css.find(m=>!m.remove).css,/\.specific-ad/);
  const all=harness({host:'news.example.org',importedRules:commonRules,cosmeticPolicies:[{...rule,modes:['all']}]});await tick();
  assert.equal(all.status().ready,true);assert.equal(all.status().selectors,0);assert.equal(all.status().applied,false);assert.equal(all.css.length,0);
});
test('selector exceptions also protect a matching explicit built-in selector',async()=>{
  const selector='[id^="enter_"]:has(> iframe[src^="//ad.ad4989.co.kr/"])';
  const h=harness({host:'news.example.org',bundled:true,importedRules:[{domains:['news.example.org'],selector,exception:true}]});await tick();
  assert.equal(h.status().selectors,4);assert.ok(!h.css.find(m=>!m.remove).css.includes(selector));
});
test('real maintained cosmetic snapshots work on multiple hosts beyond the compatibility fixture',async()=>{
  const importedRules=JSON.parse(read('filters/cosmetic.json'));
  for(const host of ['news.example.org','www.naver.com']) {
    const h=harness({host,bundled:true,importedRules});await tick();
    assert.equal(h.status().mode,'general');assert.equal(h.status().error,null);
    assert.equal(h.status().siteSelectors,0);assert.equal(h.status().genericAllowed,true);
    assert.ok(h.status().selectors>10000);assert.match(h.css.find(m=>!m.remove).css,/\.ad_banner\{/);
  }
  const account=harness({host:'accounts.google.com',bundled:true,importedRules});await tick();
  assert.equal(account.status().error,null);assert.equal(account.status().genericAllowed,false);
  assert.ok(account.status().skippedSelectors>10000);
  assert.doesNotMatch(account.css.find(m=>!m.remove).css,/^\.ad_banner\{/m);
});
