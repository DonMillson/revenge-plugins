"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const { validateManifest, normalizeAsset, uploadRequest, createController } = require("../src/core.js");
const defaults = require("../config.json"), guild = "100000000000000001", owner = "100000000000000002";
const manifest = extra => ({ schema:1, guildId:guild, revision:"a".repeat(32), enabled:true, updatedAt:"2026-10-10T12:00:00.000Z", assetPath:"/assets/"+guild+"/"+ "a".repeat(32), fileName:"wall.png", mimeType:"image/png", size:100, width:100, height:100, dim:0.45, blur:0, ...extra });
function setup(getManifest) {
  let clock = 100000, calls = 0;
  const settings = { enabled:true }, deps = { now:()=>clock, getGuild:id=>id===guild?{ownerId:owner}:null, getManifest: async url=>{ calls++; return getManifest ? getManifest(url):manifest(); } };
  const c = createController(deps,defaults,settings); c.start();
  return { c, settings, advance:ms=>clock+=ms, calls:()=>calls };
}
test("only matching guild service assets are accepted", () => {
  assert.match(validateManifest(manifest(),guild,defaults).url,/\/assets\//);
  for (const patch of [{guildId:owner},{assetPath:"https://evil.example/a.png"},{revision:"../evil"},{size:defaults.maxImageBytes+1},{width:5000},{mimeType:"image/svg+xml"},{dim:1},{blur:100}]) assert.throws(()=>validateManifest(manifest(patch),guild,defaults));
});
test("native picker files are normalized and unsafe files are rejected", () => {
  assert.equal(normalizeAsset({uri:"content://images/1",fileCopyUri:"file:///copy.png",name:"copy.png",type:"image/png"},defaults).uri,"file:///copy.png");
  assert.equal(normalizeAsset({uri:"file:///x",name:"wall.jpg"},defaults).type,"image/jpeg");
  for(const asset of [{uri:"https://example.com/a.png",type:"image/png"},{uri:"file:///a.svg",type:"image/svg+xml"},{uri:"content://x",type:"image/png",fileSize:defaults.maxImageBytes+1},{uri:"content://x",type:"image/png",width:4097}]) assert.throws(()=>normalizeAsset(asset,defaults));
});
test("gallery upload uses base64 while file upload sends native FormData without a boundary override", () => {
  const asset={uri:"file:///wall.png",name:"wall.png",type:"image/png",base64:"YWJj"};
  const json=uploadRequest(asset,0.45,0,"private-key"); assert.equal(JSON.parse(json.body).base64,"YWJj"); assert.equal(json.headers["X-Owner-Key"],"private-key");
  class Form { entries=[]; append(...args){this.entries.push(args);} }
  const file=uploadRequest({...asset,base64:""},0.5,1,"private-key",Form);
  assert.equal(file.headers["Content-Type"],undefined); assert.equal(file.body.entries[0][1].uri,asset.uri);
});
test("members read the same server manifest without any publishing key", async () => {
  const a=setup(), b=setup(); await Promise.all([a.c.sync(guild),b.c.sync(guild)]);
  assert.equal(a.c.snapshot(guild).url,b.c.snapshot(guild).url); assert.equal(a.settings.ownerKey,undefined);
  a.settings.localDim=0.8; assert.equal(a.c.snapshot(guild).dim,0.8); assert.equal(b.c.snapshot(guild).dim,0.45);
});
test("missing and disabled shared configurations remove cached images", async () => {
  let data=manifest(); const s=setup(()=>data); await s.c.sync(guild); assert.ok(s.c.snapshot(guild));
  data=null; await s.c.sync(guild,true); assert.equal(s.c.snapshot(guild),null);
  s.c.publish(guild,manifest()); data=manifest({enabled:false,revision:"b".repeat(32),updatedAt:"2026-10-10T12:01:00.000Z"});
  await s.c.sync(guild,true); assert.equal(s.c.snapshot(guild),null);
});
test("an old poll cannot overwrite a newly published file", async () => {
  let resolve; const s=setup(()=>new Promise(r=>resolve=r)); const pending=s.c.sync(guild);
  await Promise.resolve(); s.c.publish(guild,manifest({fileName:"new.png",updatedAt:"2026-10-10T12:01:00.000Z"})); resolve(manifest()); await pending;
  assert.equal(s.c.snapshot(guild).filename,"new.png");
});
test("late results after unload do not change saved state", async () => {
  let resolve; const s=setup(()=>new Promise(r=>resolve=r)); const pending=s.c.sync(guild); await Promise.resolve();
  s.c.stop(); resolve(manifest()); await pending; assert.equal(s.settings.sharedThemes,undefined); assert.equal(s.c.snapshot(guild),null);
});
test("polls are deduplicated, throttled and respect rate-limit backoff even on manual refresh", async () => {
  let reject; const s=setup(()=>new Promise((_,r)=>reject=r));
  const a=s.c.sync(guild),b=s.c.sync(guild,true); assert.equal(a,b); await Promise.resolve();
  reject({status:429,retryMs:60000}); await a;
  await s.c.sync(guild,true); assert.equal(s.calls(),1); s.advance(60001);
  const next=s.c.sync(guild); await Promise.resolve(); assert.equal(s.calls(),2); reject(new Error("offline")); await next;
});
test("valid cached service images work offline, corrupt cache and other servers never show", async () => {
  const settings={sharedThemes:{[guild]:manifest(),[owner]:manifest({guildId:owner,assetPath:"file:///local.png"})}};
  const c=createController({getGuild:()=>({ownerId:owner}),getManifest:()=>Promise.reject(new Error("offline"))},defaults,settings); c.start();
  assert.ok(c.snapshot(guild)); assert.equal(c.snapshot(owner),null); await c.sync(guild); assert.ok(c.snapshot(guild));
  settings.targetGuildId=owner; assert.equal(c.snapshot(guild),null); settings.enabled=false; assert.equal(c.snapshot(owner),null);
});
