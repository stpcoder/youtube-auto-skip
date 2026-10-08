const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const read = f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
function harness() {
  const c=vm.createContext({ URL,console });
  vm.runInContext(read('safari/extension/media-core.js'),c);
  return { c,run:s=>vm.runInContext(s,c),core:vm.runInContext("globalThis[Symbol.for('yas.safari.media-core')]",c) };
}
test('watch route excludes Shorts, home and malformed URLs',()=>{
  const c=harness().core;
  assert.equal(c.watchId('https://m.youtube.com/watch?v=abc'),'abc');
  for(const u of ['https://m.youtube.com/shorts/abc','https://m.youtube.com/','garbage'])assert.equal(c.watchId(u),null);
});
function video(){const attrs=new Map([['disablepictureinpicture','']]);return {readyState:4,getAttribute:n=>attrs.get(n)??null,removeAttribute(n){attrs.delete(n)},setAttribute(n,v){attrs.set(n,v)},attr:()=>attrs.get('disablepictureinpicture')??null};}
test('PiP uses captured native method, not the YouTube instance override',async()=>{
  const v=video();v.webkitSetPresentationMode=()=>{throw Error('YouTube override')};let called=0;
  const result=await harness().core.enterPiP(v,{supportsMode:()=>true,setMode:function(mode){assert.equal(this,v);assert.equal(mode,'picture-in-picture');called++}});
  assert.equal(result,'webkit');assert.equal(called,1);assert.equal(v.attr(),null);
});
test('PiP restores the original disable attribute if native invocation fails',()=>{
  const v=video();
  assert.throws(()=>harness().core.enterPiP(v,{setMode:()=>{throw Error('not permitted')}}),/not permitted/);
  assert.equal(v.attr(),'');
});
test('PiP rejects unready video and unsupported APIs, rather than reporting success',()=>{
  const c=harness().core,v=video();v.readyState=0;
  assert.throws(()=>c.enterPiP(v,{}),/먼저/);v.readyState=4;
  assert.throws(()=>c.enterPiP(v,{}),/지원/);
});
test('standard PiP promise rejection restores the flag',async()=>{
  const v=video();await assert.rejects(harness().core.enterPiP(v,{requestPiP:()=>Promise.reject(Error('denied'))}),/denied/);
  assert.equal(v.attr(),'');
});
test('Safari installs the fixed YouTube MAIN entry at document_start without Chrome debugger',()=>{
  const m=JSON.parse(read('safari/extension/manifest.json'));
  assert.ok(!m.permissions.includes('debugger'));assert.ok(m.permissions.includes('declarativeNetRequest'));
  assert.deepEqual(m.host_permissions,['http://*/*','https://*/*']);
  const startup=m.content_scripts.filter(c=>c.world==='MAIN');assert.equal(startup.length,1);
  assert.deepEqual(startup[0].js,['youtube-main.js']);assert.equal(startup[0].run_at,'document_start');
  assert.ok(startup[0].matches.every(url=>/^https:\/\/(?:www\.|m\.)?youtube\.com\/\*$/.test(url)));
  assert.ok(m.content_scripts.some(c=>c.js.includes('mobile-skip.js')));
  assert.equal(m.declarative_net_request.rule_resources[0].path,'network.json');
});
test('Safari bootstrap falls back to fixed MAIN files only for trusted YouTube frames',async()=>{
  let listener;const calls=[];
  const evt={addListener:()=>{}};
  const c=vm.createContext({URL,browser:{runtime:{id:'ext',onMessage:{addListener:f=>listener=f},onInstalled:evt,onStartup:evt},storage:{local:{get:async d=>d,remove:async()=>{},set:async()=>{}},onChanged:evt},declarativeNetRequest:{getDynamicRules:async()=>[],updateDynamicRules:async()=>{},updateEnabledRulesets:async()=>{}},scripting:{executeScript:async x=>calls.push(x)}},console});
  vm.runInContext(read('safari/extension/background.js'),c);
  const s={frameId:0,tab:{id:4},url:'https://m.youtube.com/watch?v=abc'};
  for(const bad of [{...s,url:'https://youtube.com.evil.org/watch'},{...s,frameId:1},{...s,tab:{}}])assert.equal(listener({type:'YAS_SAFARI_INIT'},bad),false);
  assert.equal(listener({type:'YAS_GENERAL_CSS'},s),false);
  assert.equal((await listener({type:'YAS_SAFARI_INIT'},s)).ok,true);
  assert.equal(calls[0].world,'MAIN');assert.equal(calls[0].target.tabId,4);
  assert.equal(typeof calls[0].func,'function');
  assert.deepEqual(Array.from(calls[1].files),['youtube-main.js']);
});
test('Safari bootstrap only checks an installed document_start entry instead of reinjecting it',async()=>{
  let listener;const calls=[],evt={addListener:()=>{}};
  const c=vm.createContext({URL,console,browser:{runtime:{id:'ext',onMessage:{addListener:f=>listener=f},onInstalled:evt,onStartup:evt},
    storage:{local:{get:async d=>d,remove:async()=>{},set:async()=>{}},onChanged:evt},
    declarativeNetRequest:{getDynamicRules:async()=>[],updateDynamicRules:async()=>{},updateEnabledRulesets:async()=>{}},
    scripting:{executeScript:async x=>{calls.push(x);return [{result:true}];}}}});
  vm.runInContext(read('safari/extension/background.js'),c);
  const result=await listener({type:'YAS_SAFARI_INIT'},{frameId:0,tab:{id:4},url:'https://m.youtube.com/watch?v=content'});
  assert.equal(result.ok,true);assert.equal(result.source,'document-start');
  assert.equal(calls.length,1);assert.equal(calls[0].files,undefined);
});
test('background visibility guard is opt-in, reversible and reads actual OS visibility',()=>{
  const c=harness().core,listeners={};let hidden=true;
  const proto={};Object.defineProperties(proto,{hidden:{get:()=>hidden},visibilityState:{get:()=>hidden?'hidden':'visible'}});
  const doc=Object.create(proto);doc.addEventListener=(n,f)=>listeners[n]=f;
  const guard=c.visibilityGuard(doc);assert.equal(doc.hidden,true);
  guard.enable();assert.equal(doc.hidden,false);assert.equal(doc.visibilityState,'visible');assert.equal(guard.hidden(),true);
  let stopped=0;listeners.visibilitychange({stopImmediatePropagation(){stopped++}});assert.equal(stopped,1);
  guard.disable();assert.equal(doc.hidden,true);assert.equal(Object.hasOwn(doc,'hidden'),false);
  hidden=false;listeners.visibilitychange({stopImmediatePropagation(){stopped++}});assert.equal(stopped,1);
});
test('visibility guard intercepts window capture and Safari legacy visibility aliases',()=>{
  const c=harness().core,listeners={};let hidden=true;
  const proto={};for(const name of ['hidden','webkitHidden'])Object.defineProperty(proto,name,{get:()=>hidden});
  for(const name of ['visibilityState','webkitVisibilityState'])Object.defineProperty(proto,name,{get:()=>hidden?'hidden':'visible'});
  const doc=Object.create(proto);doc.addEventListener=()=>{};doc.defaultView={addEventListener:(name,f,capture)=>{assert.equal(capture,true);listeners[name]=f}};
  const guard=c.visibilityGuard(doc);guard.enable();assert.equal(doc.webkitHidden,false);assert.equal(doc.webkitVisibilityState,'visible');
  let stopped=0;listeners.visibilitychange({stopImmediatePropagation(){stopped++}});assert.equal(stopped,1);
  guard.disable();assert.equal(doc.webkitHidden,true);assert.equal(Object.hasOwn(doc,'webkitHidden'),false);
});
test('playback audio session is optional and does not overwrite a later owner',()=>{
  const c=harness().core;assert.equal(c.playbackAudioSession({}).state,'unavailable');
  const nav={audioSession:{type:'auto'}},session=c.playbackAudioSession(nav);assert.equal(session.state,'playback');
  nav.audioSession.type='ambient';session.restore();assert.equal(nav.audioSession.type,'ambient');
  const rejected={audioSession:{get type(){return 'auto'},set type(v){throw Error('not allowed')}}};assert.equal(c.playbackAudioSession(rejected).state,'rejected');
});
test('Safari DNR never blocks main-frame navigation and retains every exception and YouTube exclusion',async()=>{
  const {safariNetworkRules}=await import('../scripts/lib/safari-rules.mjs');
  const chrome=JSON.parse(read('filters/network.json')), safari=safariNetworkRules(chrome);
  assert.equal(safari.filter(r=>r.action.type==='allow').length,chrome.filter(r=>r.action.type==='allow').length);
  for(const rule of safari){assert.ok(rule.condition.excludedInitiatorDomains.includes('youtube.com'));if(rule.action.type==='block')assert.ok(!rule.condition.resourceTypes.includes('main_frame'));if(rule.action.type==='allowAllRequests')assert.deepEqual(rule.condition.resourceTypes,['main_frame']);}
});
test('Safari routes general MAIN and USER CSS to the originating frame, excluding YouTube',async()=>{
  let listener;const calls=[];const evt={addListener:()=>{}};
  const c=vm.createContext({URL,console,browser:{runtime:{id:'ext',onMessage:{addListener:f=>listener=f},onInstalled:evt,onStartup:evt},storage:{local:{get:async d=>d,remove:async()=>{},set:async()=>{}},onChanged:evt},declarativeNetRequest:{getDynamicRules:async()=>[],updateDynamicRules:async()=>{},updateEnabledRulesets:async()=>{}},scripting:{executeScript:async x=>calls.push(['main',x]),insertCSS:async x=>calls.push(['insert',x]),removeCSS:async x=>calls.push(['remove',x])}}});
  vm.runInContext(read('safari/extension/background.js'),c);
  const sender={frameId:7,tab:{id:5,url:'https://news.example/article'},url:'https://frame.example/embed'};
  assert.equal((await listener({type:'YAS_GENERAL_INIT'},sender)).ok,true);
  assert.deepEqual(Array.from(calls[0][1].files),['general-main.js']);
  assert.equal(calls[0][1].target.frameIds[0],7);
  assert.equal((await listener({type:'YAS_FRAME_CONTEXT'},sender)).host,'news.example');
  for(const remove of [false,true])assert.equal((await listener({type:'YAS_GENERAL_CSS',css:'.ad{display:none!important}',remove},sender)).ok,true);
  assert.equal(calls[1][1].origin,'USER');assert.equal(calls[2][0],'remove');
  for(const request of [{type:'YAS_GENERAL_INIT'},{type:'YAS_GENERAL_CSS',css:'.ad{}',remove:false}])assert.equal(listener(request,{...sender,url:'https://m.youtube.com/watch?v=abc'}),false);
});
test('Safari global disable and site exceptions synchronize without deleting unrelated rules',async()=>{
  let listener;const evt={addListener:()=>{}};let enabled=true;const dynamic=[],staticRules=[];
  const c=vm.createContext({URL,console,browser:{runtime:{id:'ext',onMessage:{addListener:f=>listener=f},onInstalled:evt,onStartup:evt},storage:{local:{get:async()=>({globalEnabled:enabled,disabledSites:['news.example']}),remove:async()=>{},set:async()=>{}},onChanged:evt},declarativeNetRequest:{getDynamicRules:async()=>[{id:1000000},{id:88}],updateDynamicRules:async x=>dynamic.push(x),updateEnabledRulesets:async x=>staticRules.push(x)}}});
  vm.runInContext(read('general/policy.js'),c);
  vm.runInContext(read('safari/extension/background.js'),c);
  await listener({type:'YAS_SYNC_RULES'},{id:'ext'});
  const first=dynamic.at(-1);assert.deepEqual(Array.from(first.removeRuleIds),[1000000]);
  assert.equal(first.addRules[0].action.type,'allowAllRequests');assert.deepEqual(Array.from(first.addRules[0].condition.resourceTypes),['main_frame']);
  enabled=false;await listener({type:'YAS_SYNC_RULES'},{id:'ext'});
  assert.equal(dynamic.at(-1).addRules.length,0);assert.deepEqual(Array.from(staticRules.at(-1).disableRulesetIds),['general_ads']);
  assert.equal(listener({type:'YAS_SYNC_RULES'},{id:'another-extension'}),false);
});
test('Safari site provider exceptions preserve banners, popup settings and child opt-ins',async()=>{
  let listener;const evt={addListener:()=>{}};const dynamic=[];
  const settings={globalEnabled:true,disabledSites:[],siteFeatures:{'news.example':{providers:false,banners:true,popups:true},'secure.news.example':{providers:true}}};
  const c=vm.createContext({URL,console,browser:{runtime:{id:'ext',onMessage:{addListener:f=>listener=f},onInstalled:evt,onStartup:evt},storage:{local:{get:async d=>({...d,...settings}),remove:async()=>{},set:async()=>{}},onChanged:evt},declarativeNetRequest:{getDynamicRules:async()=>[],updateDynamicRules:async x=>dynamic.push(x),updateEnabledRulesets:async()=>{}}}});
  vm.runInContext(read('general/policy.js'),c);vm.runInContext(read('safari/extension/background.js'),c);
  assert.equal((await listener({type:'YAS_SYNC_RULES'},{id:'ext'})).ok,true);
  assert.deepEqual(JSON.parse(JSON.stringify(dynamic.at(-1).addRules[0].condition)),{requestDomains:['news.example'],excludedRequestDomains:['secure.news.example'],resourceTypes:['main_frame']});
  const message={type:'FOCUS_SITE_FEATURES',host:'news.example'};
  assert.deepEqual(JSON.parse(JSON.stringify(await listener(message,{id:'ext'}))),{providers:false,banners:true,popups:true});
  assert.equal(listener(message,{id:'other'}),false);
  assert.equal(listener(message,{id:'ext',tab:{id:1}}),false);
});
test('Focus exposes only an explicit menu request to its own popup, never an automatic PiP command',async()=>{
  let listener;const calls=[];const evt={addListener:()=>{}};
  const c=vm.createContext({URL,console,browser:{runtime:{id:'ext',onMessage:{addListener:f=>listener=f},onInstalled:evt,onStartup:evt},tabs:{query:async()=>[{id:4,url:'https://m.youtube.com/watch?v=abc'}]},storage:{local:{get:async d=>d,remove:async()=>{},set:async()=>{}},onChanged:evt},declarativeNetRequest:{getDynamicRules:async()=>[],updateDynamicRules:async()=>{},updateEnabledRulesets:async()=>{}},scripting:{executeScript:async x=>{calls.push(x);return [{result:{ok:true}}]}}}});
  vm.runInContext(read('safari/extension/background.js'),c);
  assert.equal(listener({type:'FOCUS_SHOW_PLAYBACK'},{id:'other'}),false);
  assert.equal(listener({type:'FOCUS_SHOW_PLAYBACK'},{id:'ext',tab:{id:4},url:'https://m.youtube.com/watch?v=abc'}),false);
  assert.equal((await listener({type:'FOCUS_SHOW_PLAYBACK'},{id:'ext'})).ok,true);
  assert.deepEqual(Array.from(calls[0].files),['youtube-main.js']);
  assert.equal(calls[1].world,'MAIN');assert.match(String(calls[1].func),/focus-show-playback/);
  assert.doesNotMatch(String(calls[1].func),/enterPiP|webkitSetPresentationMode|\.play\(/);
});
test('Focus onboarding is a native optional Swift Package and the startup stays silent',()=>{
  assert.equal(JSON.parse(read('safari/extension/manifest.json')).name,'Focus');
  assert.match(read('safari/Package.swift'),/library\(name: "FocusSetup"/);
  assert.match(read('safari/host/FocusSetupViewController.swift'),/public final class FocusSetupViewController/);
  assert.doesNotMatch(read('safari/host/FocusSetupViewController.swift'),/WKWebView|URLSession|AVPictureInPicture/);
  assert.doesNotMatch(read('safari/extension/bootstrap.js'),/createElement|position:fixed/);
  assert.doesNotMatch(read('safari/extension/popup.html'),/AdBlock|광고 차단|개발용/);
});
