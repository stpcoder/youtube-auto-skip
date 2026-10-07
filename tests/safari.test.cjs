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
function model(formats=[{mimeType:'audio/mp4; codecs="mp4a.40.2"',url:'https://r1.googlevideo.com/videoplayback?expire=2000000000',bitrate:128000}]) {
  return {videoDetails:{videoId:'abc'},playabilityStatus:{status:'OK'},streamingData:{adaptiveFormats:formats}};
}
test('audio selects a playable signed direct HTTPS Googlevideo stream',()=>{
  const core=harness().core, m=model();
  assert.equal(core.selectAudio(m,'abc',()=> 'probably',1700000000000).bitrate,128000);
  m.streamingData.adaptiveFormats.push({...m.streamingData.adaptiveFormats[0],bitrate:256000});
  assert.equal(core.selectAudio(m,'abc',()=> 'probably',1700000000000).bitrate,256000);
});
test('audio refuses stale responses, live streams, unplayable status and unsupported codecs',()=>{
  const c=harness().core,m=model();
  assert.equal(c.selectAudio(m,'different',()=>true),null);
  assert.equal(c.selectAudio(m,'abc',()=>false),null);
  m.videoDetails.isLiveContent=true;assert.equal(c.selectAudio(m,'abc',()=>true),null);
  m.videoDetails.isLiveContent=false;m.playabilityStatus.status='UNPLAYABLE';assert.equal(c.selectAudio(m,'abc',()=>true),null);
});
test('audio refuses unsigned cipher-only, non-audio, expired and unrelated URLs',()=>{
  const c=harness().core;
  for (const f of [
    {mimeType:'audio/mp4',signatureCipher:'url=https%3A%2F%2Fr1.googlevideo.com'},
    {mimeType:'video/mp4',url:'https://r1.googlevideo.com/a'},
    {mimeType:'audio/mp4',url:'http://r1.googlevideo.com/a'},
    {mimeType:'audio/mp4',url:'https://googlevideo.com.evil.org/a'},
    {mimeType:'audio/mp4',url:'https://name:password@r1.googlevideo.com/a'},
    {mimeType:'audio/mp4',url:'https://r1.googlevideo.com/a?expire=1700000001'},
    {mimeType:'audio/mp4',url:'https://r1.googlevideo.com/a?expire=NaN'},
  ]) assert.equal(c.selectAudio(model([f]),'abc',()=>true,1700000000000),null);
});
test('watch route excludes Shorts, home and malformed URLs',()=>{
  const c=harness().core;
  assert.equal(c.watchId('https://m.youtube.com/watch?v=abc'),'abc');
  for(const u of ['https://m.youtube.com/shorts/abc','https://m.youtube.com/','garbage'])assert.equal(c.watchId(u),null);
});
test('malformed audio format lists are unsupported, not uncaught failures',()=>{
  const c=harness().core,m=model();m.streamingData.adaptiveFormats={};
  assert.equal(c.selectAudio(m,'abc',()=>true),null);
  m.streamingData.adaptiveFormats=[null,{mimeType:4}];assert.equal(c.selectAudio(m,'abc',()=>true),null);
});
function video(){let attr='';return {readyState:4,getAttribute:()=>attr,removeAttribute(){attr=null},setAttribute(_n,v){attr=v},attr:()=>attr};}
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
test('Safari is YouTube-only and does not depend on Chrome debugger or unsupported manifest world',()=>{
  const m=JSON.parse(read('safari/extension/manifest.json'));
  assert.deepEqual(m.permissions,['scripting']);
  assert.ok(m.host_permissions.every(p=>/^https:\/\/(www\.|m\.)?youtube\.com\/\*$/.test(p)));
  assert.ok(m.content_scripts.every(c=>!c.world));
  assert.ok(m.content_scripts.some(c=>c.js.includes('mobile-skip.js')));
});
test('Safari bootstrap injects fixed files into MAIN only for trusted YouTube frames',async()=>{
  let listener;const calls=[];
  const c=vm.createContext({browser:{runtime:{onMessage:{addListener:f=>listener=f}},scripting:{executeScript:async x=>calls.push(x)}},console});
  vm.runInContext(read('safari/extension/background.js'),c);
  const s={frameId:0,tab:{id:4},url:'https://m.youtube.com/watch?v=abc'};
  for(const bad of [{...s,url:'https://youtube.com.evil.org/watch'},{...s,frameId:1},{...s,tab:{}}])assert.equal(listener({type:'YAS_SAFARI_INIT'},bad),false);
  assert.equal(listener({type:'YAS_GENERAL_CSS'},s),false);
  assert.equal((await listener({type:'YAS_SAFARI_INIT'},s)).ok,true);
  assert.equal(calls[0].world,'MAIN');assert.equal(calls[0].target.tabId,4);
  assert.ok(calls[0].files.includes('controls.js'));assert.ok(!calls[0].files.some(f=>f.startsWith('general/')));
});
