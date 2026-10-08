const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
function harness(before='', open=true) {
  const c=vm.createContext({URL,console});
  vm.runInContext(`
    window=globalThis; location={href:'https://m.youtube.com/watch?v=content'};performance={now:()=>100};
    jobs=[]; timers=[]; queueMicrotask=f=>jobs.push(f); setTimeout=f=>{timers.push(f);return timers.length};clearTimeout=()=>{};
    windowListeners={}; addEventListener=(n,f)=>(windowListeners[n]??=[]).push(f); MutationObserver=class {observe(){}};
    class Element {
      constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.attrs=new Map();this.dataset={};this.listeners={};this.isConnected=false;this.textContent='';this.classList={toggle:()=>false};}
      set innerHTML(value){throw new TypeError('TrustedHTML required');}
      setAttribute(n,v){this.attrs.set(n,v);if(n==='id')this.id=v;}
      getAttribute(n){return this.attrs.get(n)??null;} removeAttribute(n){this.attrs.delete(n);}
      append(...nodes){for(const n of nodes){n.isConnected=true;n.parentNode=this;this.children.push(n);}}
      insertBefore(node,next){node.isConnected=true;node.parentNode=this;const i=this.children.indexOf(next);if(i<0)this.children.push(node);else this.children.splice(i,0,node);}
      remove(){this.isConnected=false;if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(n=>n!==this);}
      attachShadow(){return this.shadow=new Element('shadow');}
      querySelector(s){if(s.startsWith('#'))return this.find(e=>e.id===s.slice(1));if(s==='video')return this.find(e=>e.tagName==='VIDEO');return this.find(e=>e.attrs.get('class')===s.slice(1));}
      find(f){for(const n of this.children){if(f(n))return n;const result=n.find(f);if(result)return result;}return null;}
      addEventListener(n,f){(this.listeners[n]??=[]).push(f);} removeEventListener(n,f){this.listeners[n]=(this.listeners[n]||[]).filter(x=>x!==f);}
      dispatch(n,event={}){for(const f of this.listeners[n]||[])f(event);}
      matches(){return false;}getBoundingClientRect(){return {width:390};}
    }
    HTMLMediaElement=class extends Element {
      constructor(tag){super(tag);this.currentTime=8;this.duration=120;this.readyState=4;this.volume=1;this.muted=true;this.playbackRate=1;this.paused=false;this.pauseCalls=0;this.loadCalls=0;}
      play(){if(rejectVideo)return Promise.reject(new Error('video denied'));if(pendingPlay)return new Promise(r=>resolvePlay=r);this.paused=false;this.dispatch('play');return Promise.resolve();}
      pause(){this.pauseCalls++;this.paused=true;this.dispatch('pause');} load(){this.loadCalls++;}canPlayType(){return 'probably';}
    };
    HTMLVideoElement=class extends HTMLMediaElement {
      constructor(){super('video');this.webkitPresentationMode='inline';}
      webkitSupportsPresentationMode(){return true;}webkitSetPresentationMode(mode){this.webkitPresentationMode=mode;this.dispatch('webkitpresentationmodechanged');}
    };
    rejectVideo=false;pendingPlay=false;provideAudio=false;hidden=false;createdAudio=0;
    document=new Element('document');Object.defineProperties(document,{hidden:{configurable:true,get:()=>hidden},visibilityState:{configurable:true,get:()=>hidden?'hidden':'visible'}});
    document.defaultView=window;
    document.documentElement=new Element('html');document.body=new Element('body');document.append(document.documentElement);document.documentElement.append(document.body);
    video=new HTMLVideoElement();player=new Element('div');player.id='movie_player';player.append(video);document.body.append(player);
    player.getPlayerResponse=()=>({videoDetails:{videoId:'content',title:'Test'},playabilityStatus:{status:'OK'},streamingData:{adaptiveFormats:provideAudio?[{mimeType:'audio/mp4',url:'https://r1.googlevideo.com/a'}]:[]}});
    document.getElementById=id=>document.find(e=>e.id===id);
    document.querySelectorAll=s=>s==='video'?[video]:[];
    document.createElement=tag=>{if(tag==='audio')createdAudio++;return tag==='audio'?new HTMLMediaElement('audio'):new Element(tag)};
    document.createElementNS=(namespace,tag)=>new Element(tag);
    navigator={audioSession:{type:'auto'},mediaSession:{metadata:null,handlers:{},setActionHandler(n,f){this.handlers[n]=f;},setPositionState(v){this.position=v;}}};MediaMetadata=class{constructor(v){Object.assign(this,v)}};
    drain=()=>{while(jobs.length)jobs.shift()();};
    click=id=>document.getElementById('yas-safari-tools').shadow.querySelector('#'+id).dispatch('click');
    stats=()=>JSON.parse(document.documentElement.dataset.yasSafariMediaStatus);
    statusText=()=>document.getElementById('yas-safari-tools').shadow.querySelector('#status').textContent;
  `,c);
  vm.runInContext(before,c);
  for(const file of ['media-core.js','controls.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../safari/extension',file),'utf8'),c);
  vm.runInContext('drain()',c);
  if(open)vm.runInContext("document.dispatch('focus-show-playback');drain()",c);
  return {run:s=>vm.runInContext(s,c),settle:async()=>{for(let i=0;i<5;i++){await Promise.resolve();vm.runInContext('drain()',c);}}};
}
test('controls mount with TrustedHTML-required setters and find mobile video',()=>{
  const h=harness();assert.equal(h.run("!!document.getElementById('yas-safari-tools')"),true);
  assert.equal(h.run("!!document.getElementById('yas-safari-tools').shadow.querySelector('#pip')"),true);
  assert.equal(h.run('stats().lastError'),null);
});
test('Focus automatically keeps three SVG playback buttons available on watch pages',()=>{
  const h=harness('',false);
  assert.equal(h.run("!!document.getElementById('yas-safari-tools')"),true);
  for(const id of ['pip','background','fullscreen']) {
    assert.equal(h.run(`document.getElementById('yas-safari-tools').shadow.querySelector('#${id}').children[0].tagName`),'SVG');
    assert.ok(h.run(`document.getElementById('yas-safari-tools').shadow.querySelector('#${id}').getAttribute('aria-label')`));
  }
  h.run("originalPanel=document.getElementById('yas-safari-tools')");
  h.run("document.dispatch('focus-show-playback');drain()");
  assert.equal(h.run("document.getElementById('yas-safari-tools')===originalPanel"),true);
  assert.equal(h.run('stats().background'),'off');
  assert.equal(h.run('video.pauseCalls+video.loadCalls'),0);
});
test('background state updates the SVG button without removing its icon',async()=>{
  const h=harness();h.run("click('background')");await h.settle();
  assert.equal(h.run('stats().background'),'armed');assert.equal(h.run('video.pauseCalls'),0);
  assert.equal(h.run("document.getElementById('yas-safari-tools').shadow.querySelector('#background').getAttribute('aria-pressed')"),'true');
  assert.equal(h.run("document.getElementById('yas-safari-tools').shadow.querySelector('#background').children[0].tagName"),'SVG');
});
test('SABR/no audio URL arms original video without pausing or reloading it',async()=>{
  const h=harness();h.run("click('background')");await h.settle();
  assert.equal(h.run('stats().mode'),'background-video');assert.equal(h.run('video.paused'),false);assert.equal(h.run('video.muted'),false);
  assert.equal(h.run('document.hidden'),false);assert.equal(h.run('stats().background'),'armed');
  h.run("click('background')");await h.settle();assert.equal(h.run('stats().background'),'off');assert.equal(h.run('stats().mode'),'video');
});
test('background keeps original video even when a direct audio URL exists',async()=>{
  const h=harness('provideAudio=true');h.run("video.src='blob:original';click('background')");await h.settle();
  assert.equal(h.run('createdAudio'),0);assert.equal(h.run('stats().mode'),'background-video');assert.equal(h.run('video.paused'),false);
  assert.equal(h.run('video.pauseCalls+video.loadCalls'),0);assert.equal(h.run('video.currentTime'),8);assert.equal(h.run('video.src'),'blob:original');
});
test('video play rejection cleans up and reports the real failure',async()=>{
  const h=harness('rejectVideo=true');h.run("click('background')");await h.settle();
  assert.equal(h.run('stats().background'),'off');assert.equal(h.run('stats().mode'),'video');assert.equal(h.run('navigator.audioSession.type'),'auto');
  assert.match(h.run('statusText()'),/video denied/);
});
test('PiP success requires a real presentation change',async()=>{
  const h=harness();h.run("click('pip')");await h.settle();assert.equal(h.run('stats().mode'),'pip');assert.equal(h.run('stats().pipEntered'),1);
  const noOp=harness('HTMLVideoElement.prototype.webkitSetPresentationMode=function(){}');
  noOp.run("click('pip')");await noOp.settle();noOp.run('timers.shift()()');assert.equal(noOp.run('stats().pipEntered'),0);assert.equal(noOp.run('stats().pipRejected'),1);
});
test('an OS pause while hidden stays paused; no forced resume loop',async()=>{
  const h=harness();h.run("click('background')");await h.settle();h.run('hidden=true;video.pause()');
  assert.equal(h.run('stats().background'),'paused-hidden');assert.equal(h.run('video.paused'),true);
});
test('navigation restores visibility and clears Media Session handlers',async()=>{
  const h=harness();h.run("click('background')");await h.settle();
  h.run("location.href='https://m.youtube.com/watch?v=next';document.dispatch('yt-navigate-finish');drain();hidden=true");
  assert.equal(h.run('stats().background'),'off');assert.equal(h.run('document.hidden'),true);assert.equal(h.run('navigator.mediaSession.handlers.play'),null);
  assert.equal(h.run("!!document.getElementById('yas-safari-tools')"),true);
  h.run("location.href='https://m.youtube.com/';document.dispatch('yt-navigate-finish');drain()");
  assert.equal(h.run("!!document.getElementById('yas-safari-tools')"),false);
  h.run("location.href='https://m.youtube.com/watch?v=content';document.dispatch('yt-navigate-finish');drain()");
  assert.equal(h.run("!!document.getElementById('yas-safari-tools')"),true);
});
test('returning to Safari reconciles a missed native PiP exit',async()=>{
  const h=harness();h.run("click('pip')");await h.settle();
  h.run("video.webkitPresentationMode='inline';document.dispatch('visibilitychange');drain()");
  assert.equal(h.run('stats().mode'),'video');
  assert.equal(h.run("document.getElementById('yas-safari-tools').shadow.querySelector('#pip').getAttribute('data-active')"),'false');
});
test('OS playback session is enabled only on tap and restored on off',async()=>{
  const h=harness();assert.equal(h.run('navigator.audioSession.type'),'auto');h.run("click('background')");await h.settle();
  assert.equal(h.run('stats().audioSession'),'playback');assert.equal(h.run('navigator.audioSession.type'),'playback');
  assert.equal(h.run('navigator.mediaSession.metadata.title'),'Test');assert.equal(h.run('navigator.mediaSession.position.position'),8);
  h.run("click('background')");await h.settle();assert.equal(h.run('navigator.audioSession.type'),'auto');assert.equal(h.run('navigator.mediaSession.metadata'),null);
});
test('lock-screen manual pause is respected and explicit play resumes original',async()=>{
  const h=harness();h.run("click('background')");await h.settle();
  h.run('hidden=true;navigator.mediaSession.handlers.pause()');
  assert.equal(h.run('video.paused'),true);assert.equal(h.run('stats().background'),'paused-user');
  assert.equal(h.run('navigator.mediaSession.playbackState'),'paused');
  h.run('navigator.mediaSession.handlers.play()');await h.settle();assert.equal(h.run('video.paused'),false);
  h.run('navigator.mediaSession.handlers.seekto({seekTime:999})');assert.equal(h.run('video.currentTime'),120);
});
test('background and PiP coexist and leaving PiP preserves background mode',async()=>{
  const h=harness();h.run("click('background')");await h.settle();h.run("click('pip')");await h.settle();
  assert.equal(h.run('stats().mode'),'pip');assert.equal(h.run('stats().background'),'armed');
  h.run("video.webkitSetPresentationMode('inline')");assert.equal(h.run('stats().mode'),'background-video');
});
test('turning off during pending play cannot re-arm background',async()=>{
  const h=harness('pendingPlay=true');h.run("click('background');click('background');resolvePlay()");await h.settle();
  assert.equal(h.run('stats().background'),'off');assert.match(h.run('statusText()'),/껐습니다/);
});
test('hidden progress reports observed position change, not presumed support',async()=>{
  const h=harness();h.run("click('background')");await h.settle();
  h.run('hidden=true;windowListeners.visibilitychange[0]({stopImmediatePropagation(){}});video.currentTime=19;video.dispatch("timeupdate")');
  assert.equal(h.run('stats().hiddenProgressSeconds'),11);assert.equal(h.run('stats().background'),'armed');
});
test('PiP rejection retains native support and error details without claiming entry',async()=>{
  const h=harness("HTMLVideoElement.prototype.webkitSetPresentationMode=function(){throw Object.assign(Error('The Picture-in-Picture mode is not supported.'),{name:'NotSupportedError'})}");
  h.run("click('pip')");await h.settle();assert.equal(h.run('stats().pipEntered'),0);assert.equal(h.run('stats().pipError.name'),'NotSupportedError');
});
test('natural video ending cleans up without starting another stream',async()=>{
  const h=harness();h.run("click('background')");await h.settle();h.run("video.dispatch('ended')");
  assert.equal(h.run('stats().background'),'off');assert.equal(h.run('navigator.audioSession.type'),'auto');assert.equal(h.run('createdAudio'),0);
  assert.match(h.run('statusText()'),/끝났습니다/);
});
