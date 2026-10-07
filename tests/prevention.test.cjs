const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const source = fs.readFileSync(path.join(__dirname, "../prevention.js"), "utf8");

function harness(before = "") {
  const context = vm.createContext({ console, URL });
  vm.runInContext(`
    window = globalThis;
    location = { href: 'https://www.youtube.com/watch?v=content' };
    document = { documentElement: { dataset: {} } };
    performance = { now: () => 1000 };
    MutationObserver = class { observe() {} disconnect() {} };
    originalParse = JSON.parse;
    fetch = () => {}; originalFetch = fetch;
    model = () => ({ videoDetails:{videoId:'content',lengthSeconds:'900'},
      playabilityStatus:{status:'OK'},streamingData:{formats:[{url:'content-stream'}]},
      captions:{keep:true},adPlacements:[1],adSlots:[2],playerAds:[3],
      adBreakHeartbeatParams:'keep-heartbeat',playerConfig:{keep:true} });
    Response = class {
      constructor(raw, url='https://www.youtube.com/youtubei/v1/player') {
        this.raw=raw;this.url=url;this.bodyUsed=false;this.status=200;
      }
      async json() { if(this.bodyUsed) throw TypeError('Body already consumed');
        this.bodyUsed=true;return JSON.parse(this.raw); }
      async text() { if(this.bodyUsed) throw TypeError('Body already consumed');
        this.bodyUsed=true;return this.raw; }
      clone() { if(this.bodyUsed) throw TypeError('Body already consumed');return new Response(this.raw,this.url); }
    };
    XMLHttpRequest = class { constructor() { this.readyState=4;this.responseType='';
      this.responseURL='https://www.youtube.com/youtubei/v1/player';this.raw=JSON.stringify(model()); }
      get response() { return this.raw; }
      get responseText() { if(this.responseType && this.responseType!=='text') throw Error('InvalidStateError');return this.raw; }
    };
    stats = () => youtubeAutoSkipPrevention.getStats();
  `, context);
  if (before) vm.runInContext(before, context);
  vm.runInContext(source, context);
  return expression => vm.runInContext(expression, context);
}

test("initial response assignment removes ads before the player can read it", () => {
  const run = harness();
  run("r=model(); stream=r.streamingData; caps=r.captions; var ytInitialPlayerResponse=r");
  assert.equal(run("'adSlots' in ytInitialPlayerResponse || 'adPlacements' in ytInitialPlayerResponse || 'playerAds' in ytInitialPlayerResponse"), false);
  assert.equal(run("r.streamingData===stream && r.captions===caps && r.adBreakHeartbeatParams==='keep-heartbeat'"), true);
  assert.equal(run("stats().fieldsRemoved"), 3);
  assert.equal(run("stats().initialResponses"), 1);
});

test("also processes an existing initial response during developer injection", () => {
  const run = harness("ytInitialPlayerResponse=model()");
  assert.equal(run("'adSlots' in ytInitialPlayerResponse"), false);
  assert.equal(run("stats().fieldsRemoved"), 3);
});

test("unrelated objects with the same field names are retained", () => {
  const run = harness();
  run("ytInitialPlayerResponse={adSlots:[1],videoDetails:{videoId:'content'}}");
  assert.equal(run("ytInitialPlayerResponse.adSlots[0]"), 1);
  assert.equal(run("stats().fieldsRemoved"), 0);
});

test("preserves unrelated JSON, revivers and native fetch", () => {
  const run = harness();
  assert.equal(run("fetch===originalFetch"), true);
  assert.equal(run('JSON.parse(\'{"adSlots":[1]}\').adSlots[0]'), 1);
  assert.equal(run('JSON.parse(\'{"value":1}\', (key,value)=>key===\'value\'?2:value).value'), 2);
});

test("targeted fetch JSON is pruned, and native body consumption still applies", async () => {
  const run = harness();
  const result = await run("r=new Response(JSON.stringify(model()));r.json()");
  assert.equal(result.adSlots, undefined);
  assert.equal(result.videoDetails.videoId, "content");
  assert.equal(run("r.bodyUsed"), true);
  await assert.rejects(run("r.json()"), /Body already consumed/);
  assert.equal(run("stats().fetchResponses"), 1);
});

test("Response clones retain independent bodies and the same prevention", async () => {
  const run = harness();
  await run("r=new Response(JSON.stringify(model()));c=r.clone();c.json()");
  assert.equal(run("r.bodyUsed"), false);
  const result = await run("r.json()");
  assert.equal(result.adSlots, undefined);
});

test("watch envelopes and serialized player_response are pruned without deep page traversal", async () => {
  const run = harness();
  const text = await run("new Response(JSON.stringify([{playerResponse:model()},{player_response:JSON.stringify(model())},{account:{adSlots:[99]}}]),'https://www.youtube.com/watch?pbj=1').text()");
  const result = JSON.parse(text);
  assert.equal(result[0].playerResponse.playerAds, undefined);
  assert.equal(JSON.parse(result[1].player_response).adPlacements, undefined);
  assert.deepEqual(result[2].account.adSlots, [99]);
});

test("text responses preserve the anti-XSSI prefix", async () => {
  const run = harness();
  const text = await run('new Response(")] }".replace(" ", "")+"\'\\n"+JSON.stringify(model())).text()');
  assert.equal(text.startsWith(")]}'\n"), true);
  assert.equal(JSON.parse(text.slice(5)).adSlots, undefined);
});

test("foreign hosts and unrelated YouTube API responses are unchanged", async () => {
  const run = harness();
  for (const url of ["https://www.youtube.com.evil.test/youtubei/v1/player", "https://example.com/player", "https://www.youtube.com/youtubei/v1/browse"]) {
    const result = await run(`new Response(JSON.stringify(model()),${JSON.stringify(url)}).json()`);
    assert.equal(result.adSlots[0], 2);
  }
  assert.equal(run("stats().fieldsRemoved"), 0);
});

test("malformed JSON and HTML pass through without blocking playback", async () => {
  const run = harness();
  for (const text of ['{"adSlots":broken}', '<html>"adSlots":[]</html>']) {
    assert.equal(await run(`new Response(${JSON.stringify(text)}).text()`), text);
  }
});

test("XHR text getters cache the rewritten response and preserve the native value", () => {
  const run = harness();
  run("x=new XMLHttpRequest();a=x.responseText;b=x.response;c=x.responseText");
  assert.equal(run("a===b && b===c"), true);
  assert.equal(run("JSON.parse(a).adSlots"), undefined);
  assert.equal(run("JSON.parse(x.raw).adSlots[0]"), 2);
  assert.equal(run("stats().xhrResponses"), 1);
});

test("XHR JSON stays an object and invalid responseText access still throws", () => {
  const run = harness();
  run("x=new XMLHttpRequest();x.responseType='json';x.raw=model();r=x.response");
  assert.equal(run("r===x.raw && !('adSlots' in r)"), true);
  assert.throws(() => run("x.responseText"), /InvalidStateError/);
});

test("incomplete and unrelated XHR responses remain untouched", () => {
  const run = harness();
  run("x=new XMLHttpRequest();x.readyState=3");
  assert.equal(run("JSON.parse(x.responseText).adSlots[0]"), 2);
  run("x.readyState=4;x.responseURL='https://example.com/player'");
  assert.equal(run("JSON.parse(x.response).adSlots[0]"), 2);
});

test("read-only globals and frozen data do not break normal page execution", () => {
  const run = harness("Object.defineProperty(window,'ytInitialPlayerResponse',{configurable:false,writable:false,value:model()})");
  assert.equal(run("ytInitialPlayerResponse.adSlots[0]"), 2);
  assert.equal(run("stats().hookErrors"), 1);
  run("playerResponse=Object.freeze(model())");
  assert.equal(run("playerResponse.adSlots[0]"), 2);
});

test("duplicate injection never stacks response interception", () => {
  const run = harness();
  run("originalJson=Response.prototype.json;originalGetStats=youtubeAutoSkipPrevention.getStats;guardedParse=JSON.parse");
  run(source);
  assert.equal(run("Response.prototype.json===originalJson && youtubeAutoSkipPrevention.getStats===originalGetStats"), true);
  assert.equal(run("JSON.parse===guardedParse"), true);
});

test("streamed get_watch player frame is pruned before the chunk callback", () => {
  const run = harness();
  run("frame=JSON.parse(JSON.stringify({responseType:'STREAMING_WATCH_RESPONSE_TYPE_PLAYER_RESPONSE',subStreamResponseCompleted:true,playerResponse:model(),account:{adSlots:[99]}}))");
  assert.equal(run("'adSlots' in frame.playerResponse || 'adPlacements' in frame.playerResponse || 'playerAds' in frame.playerResponse"), false);
  assert.equal(run("frame.playerResponse.streamingData.formats[0].url==='content-stream' && frame.playerResponse.captions.keep && frame.account.adSlots[0]===99 && frame.subStreamResponseCompleted"), true);
  assert.equal(run("youtubeAutoSkipStreamingPrevention.getStats().fieldsRemoved"), 3);
});

test("stream guard excludes other frame types, ordinary player JSON and incomplete player data", () => {
  const run = harness();
  run("other=JSON.parse(JSON.stringify({responseType:'STREAMING_WATCH_RESPONSE_TYPE_WATCH_NEXT_RESPONSE',playerResponse:model()}));plain=JSON.parse(JSON.stringify(model()));incomplete=JSON.parse(JSON.stringify({responseType:'STREAMING_WATCH_RESPONSE_TYPE_PLAYER_RESPONSE',playerResponse:{adSlots:[2],videoDetails:{videoId:'content'}}}))");
  assert.equal(run("other.playerResponse.adSlots[0]===2 && plain.adSlots[0]===2 && incomplete.playerResponse.adSlots[0]===2"), true);
  assert.equal(run("youtubeAutoSkipStreamingPrevention.getStats().responsesPruned"), 0);
});

test("stream guard preserves reviver semantics, native errors and non-string input coercion", () => {
  const run = harness();
  run("raw=JSON.stringify({responseType:'STREAMING_WATCH_RESPONSE_TYPE_PLAYER_RESPONSE',playerResponse:model()});seen=[];revived=JSON.parse(raw,(key,value)=>{seen.push(key);return value});boxed=JSON.parse(new String(raw))");
  assert.equal(run("revived.playerResponse.adSlots[0]===2 && seen.includes('adSlots') && boxed.playerResponse.adSlots[0]===2"), true);
  assert.throws(() => run("JSON.parse('{broken')"), /SyntaxError/);
  assert.equal(run("JSON.parse('null')===null && JSON.parse('1')===1"), true);
});

test("stream guard still installs when an older prevention instance is present", () => {
  const run = harness("window[Symbol.for('youtube-auto-skip.prevention')]='2.4.0'");
  assert.equal(run("youtubeAutoSkipStreamingPrevention.getStats().hookInstalled"), true);
  run("frame=JSON.parse(JSON.stringify({responseType:'STREAMING_WATCH_RESPONSE_TYPE_PLAYER_RESPONSE',playerResponse:model()}))");
  assert.equal(run("frame.playerResponse.adSlots"), undefined);
});
