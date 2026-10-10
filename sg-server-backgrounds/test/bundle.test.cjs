"use strict";
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), vm = require("node:vm"), crypto = require("node:crypto"), path = require("node:path");
const defaults = require("../config.json"), dist = path.resolve(__dirname, "../dist");
const GUILD="100000000000000001", OWNER="100000000000000002", CHAT="100000000000000004", DM="100000000000000005", CHAT2="100000000000000006";
const manifest = extra => ({schema:1,guildId:GUILD,revision:"a".repeat(32),enabled:true,updatedAt:"2026-10-10T12:00:00.000Z",assetPath:"/assets/"+GUILD+"/"+ "a".repeat(32),fileName:"wall.png",mimeType:"image/png",size:100,width:100,height:100,dim:0.45,blur:0,...extra});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function walk(value,predicate) {
  if(!value || typeof value!=="object") return null;
  if(Array.isArray(value)){for(const item of value){const result=walk(item,predicate);if(result)return result;}return null;}
  if(predicate(value))return value; return walk(value.props?.children,predicate);
}
function setup({owner=true, noKey=false}={}) {
  let selected=CHAT, stateCursor=0;
  const state=[], timers=new Set(), subscriptions=new Map(), nativeRequests=[], copied=[];
  const React={
    Component:class{constructor(props){this.props=props;}},
    createElement(type,props,...children){return{type,props:Object.assign({},props,children.length?{children:children.length===1?children[0]:children}:{})};},
    cloneElement(element,props){return{type:element.type,props:Object.assign({},element.props,props)};},
    isValidElement:element=>!!element?.type&&!!element?.props,
    useEffect(){},useState(value){const index=stateCursor++;if(!(index in state))state[index]=value;return[state[index],next=>{state[index]=typeof next==="function"?next(state[index]):next;}];}
  };
  const RN={View:"View",Image:"Image",Text:"Text",ScrollView:"ScrollView",TextInput:"TextInput",TouchableOpacity:"TouchableOpacity",Switch:"Switch",
    AppState:{currentState:"active",addEventListener(){return{remove(){}};}}};
  const leaf=Object.freeze(React.createElement("Text",{style:Object.freeze({color:"white"})},"message"));
  const native=Object.freeze(React.createElement("View",{HACK_fixModalInteraction:true,style:Object.freeze({backgroundColor:"black"})},leaf));
  const tree=Object.freeze(React.createElement("View",{style:Object.freeze({flex:1,backgroundColor:"black"})},native));
  const Messages={render(){return tree;}},original=Messages.render;
  const storage=noKey?{}:{ownerKey:"sg_"+ "c".repeat(64)};
  const stores={
    SelectedChannelStore:{getChannelId:()=>selected},
    ChannelStore:{getChannel:id=>id===DM?{id,type:1}:[CHAT,CHAT2].includes(id)?{id,guild_id:GUILD,type:0}:null},
    GuildStore:{getGuild:id=>id===GUILD?{ownerId:OWNER,name:"Test server"}:null},
    UserStore:{getCurrentUser:()=>({id:owner?OWNER:"100000000000000009"})}
  };
  const picked={uri:"file:///picked.png",fileName:"picked.png",type:"image/png",fileSize:100,width:100,height:100,base64:"YWJj"};
  let pickerOptions, documentOptions, galleryResult={assets:[picked]}, fileResult={uri:"content://gallery/2",fileCopyUri:"file:///copied.png",name:"copied.png",type:"image/png",size:100};
  const gallery={launchImageLibrary(options,callback){pickerOptions=options;callback(galleryResult);return Promise.resolve(galleryResult);}};
  const files={types:{images:"image/*"},pickSingle:async options=>{documentOptions=options;return fileResult;},isCancel:error=>error?.cancelled};
  const api={plugin:{storage},metro:{common:{React,ReactNative:RN,clipboard:{setString:value=>copied.push(value)},FluxDispatcher:{
    subscribe(name,callback){subscriptions.set(name,callback);},unsubscribe(name,callback){if(subscriptions.get(name)===callback)subscriptions.delete(name);}
  }},findByStoreName:name=>stores[name],findByProps:(...props)=>props[0]==="launchImageLibrary"?gallery:props[0]==="pickSingle"?files:undefined,
    findByDisplayName:name=>name==="MessagesConnected"?Messages:undefined},
    patcher:{after(name,target,callback){const fn=target[name];target[name]=function(...args){const ret=fn.apply(this,args);const patched=callback(args,ret);return patched===undefined?ret:patched;};return()=>{target[name]=fn;};}}
  };
  Object.defineProperty(api.metro.common,"i18n",{get(){throw new Error("broken localization getter");}});
  const environment={vendetta:api,console,AbortController,
    FormData:class{entries=[];append(...args){this.entries.push(args);}},
    fetch:async(url,options)=>{nativeRequests.push({url,options});const data=options.method==="DELETE"?manifest({enabled:false,revision:"b".repeat(32),updatedAt:"2026-10-10T12:01:00.000Z"}):options.method==="PUT"?manifest({revision:"b".repeat(32),assetPath:"/assets/"+GUILD+"/"+ "b".repeat(32),fileName:options.headers["Content-Type"]?JSON.parse(options.body).fileName:"copied.png",updatedAt:"2026-10-10T12:01:00.000Z"}):manifest();return{status:200,ok:true,json:async()=>data};},
    setTimeout(fn,ms){const timer={fn,ms};timers.add(timer);return timer;},clearTimeout(timer){timers.delete(timer);},
    setInterval(fn,ms){const timer={fn,ms,interval:true};timers.add(timer);return timer;},clearInterval(timer){timers.delete(timer);}
  };
  const plugin=vm.runInNewContext("(vendetta=>{return "+fs.readFileSync(path.join(dist,"index.js"),"utf8")+"})(vendetta)",environment);
  function settingsView(){stateCursor=0;return plugin.settings();}
  return{plugin,api,storage,stores,Messages,original,tree,native,leaf,timers,subscriptions,nativeRequests,copied,environment,gallery,files,
    galleryOptions:()=>pickerOptions,fileOptions:()=>documentOptions,setGallery:value=>galleryResult=value,setFile:value=>fileResult=value,select:id=>selected=id,settingsView,
    button(label){const view=settingsView();const found=walk(view,node=>node.type==="TouchableOpacity"&&node.props.children?.props?.children===label);assert.ok(found,"button "+label);return found;},
    rendered(id){stateCursor=100;const boundary=Messages.render({channelId:id});const background=boundary.props.children;return background.type(background.props);}
  };
}
test("bundle follows Revenge's expression loader and advertised hash equals installed bytes",()=>{
  const bytes=fs.readFileSync(path.join(dist,"index.js")),manifest=JSON.parse(fs.readFileSync(path.join(dist,"manifest.json")));
  assert.equal(manifest.hash,crypto.createHash("sha256").update(bytes).digest("hex"));assert.equal(manifest.main,"index.js");
  const s=setup();assert.equal(typeof s.plugin.onLoad,"function");assert.equal(typeof s.plugin.settings,"function");
});
test("shared image layer renders on every server chat; immutable message elements retain their styles",async()=>{
  const s=setup();s.plugin.onLoad();await tick();const view=s.rendered(CHAT);
  assert.equal(view.type,"View");assert.equal(view.props.children[0].type,"Image");
  const copy=view.props.children[2].props.children;assert.notEqual(copy,s.tree);
  assert.equal(copy.props.style[1].backgroundColor,"transparent");assert.equal(copy.props.children.props.style[1].backgroundColor,"transparent");
  assert.equal(s.tree.props.style.backgroundColor,"black");assert.equal(s.native.props.style.backgroundColor,"black");assert.equal(copy.props.children.props.children,s.leaf);
  assert.equal(s.rendered(CHAT2).props.children[0].props.source.uri,view.props.children[0].props.source.uri);s.plugin.onUnload();
});
test("DMs never inherit a guild wallpaper",async()=>{
  const s=setup();s.plugin.onLoad();await tick();assert.equal(s.rendered(DM),s.tree);s.select(DM);assert.equal(s.rendered(DM),s.tree);s.plugin.onUnload();
});
test("gallery pick shows local preview, then Save publishes remotely and replaces shared image",async()=>{
  const s=setup();s.plugin.onLoad();await tick();s.button("Wybierz grafikę z galerii").props.onPress();await tick();
  assert.equal(s.galleryOptions().includeBase64,true);
  const preview=walk(s.settingsView(),node=>node.type==="Image"&&node.props.accessibilityLabel==="Podgląd tła");assert.equal(preview.props.source.uri,"file:///picked.png");
  s.button("Zapisz dla wszystkich").props.onPress();await tick();
  const upload=s.nativeRequests.find(r=>r.options.method==="PUT");assert.ok(upload);assert.equal(JSON.parse(upload.options.body).fileName,"picked.png");assert.equal(upload.options.headers["X-Owner-Key"],s.storage.ownerKey);
  assert.equal(s.rendered(CHAT2).props.children[0].props.source.uri,defaults.serviceUrl+"/assets/"+GUILD+"/"+ "b".repeat(32));
  assert.ok(walk(s.settingsView(),node=>node.type==="Text"&&String(node.props.children).startsWith("Zapisano wspólne tło")));
  assert.equal(JSON.stringify(s.storage).includes("YWJj"),false);s.plugin.onUnload();
});
test("Files picks a private copied URI and publishes native multipart data",async()=>{
  const s=setup();s.plugin.onLoad();await tick();s.button("Wybierz grafikę z plików").props.onPress();await tick();assert.equal(s.fileOptions().copyTo,"documentDirectory");
  s.button("Zapisz dla wszystkich").props.onPress();await tick();const upload=s.nativeRequests.find(r=>r.options.method==="PUT");
  assert.equal(upload.options.headers["Content-Type"],undefined);assert.equal(upload.options.body.entries[0][1].uri,"file:///copied.png");s.plugin.onUnload();
});
test("members receive wallpaper without owner key and cannot see publishing controls",async()=>{
  const s=setup({owner:false,noKey:true});s.plugin.onLoad();await tick();assert.equal(s.rendered(CHAT).props.children[0].type,"Image");
  const view=s.settingsView();assert.equal(walk(view,node=>node.type==="TouchableOpacity"&&node.props.children?.props?.children==="Zapisz dla wszystkich"),null);
  assert.equal(s.nativeRequests[0].options.headers,undefined);assert.equal(s.storage.ownerKey,undefined);s.plugin.onUnload();
});
test("cancelled picker and missing publishing key never send an upload",async()=>{
  const s=setup({noKey:true});s.plugin.onLoad();await tick();s.setGallery({didCancel:true});s.button("Wybierz grafikę z galerii").props.onPress();await tick();
  assert.equal(walk(s.settingsView(),node=>node.type==="Image"&&node.props.source.uri.startsWith("file:")),null);
  s.button("Zapisz dla wszystkich").props.onPress();await tick();assert.equal(s.nativeRequests.filter(r=>r.options.method==="PUT").length,0);s.plugin.onUnload();
});
test("shared disable removes the server wallpaper",async()=>{
  const s=setup();s.plugin.onLoad();await tick();s.button("Wyłącz wspólne tło").props.onPress();await tick();assert.equal(s.rendered(CHAT),s.tree);s.plugin.onUnload();
});
test("diagnostics tracks image loading but never includes URLs or owner key",async()=>{
  const s=setup();s.api.debug={getDebugInfo:()=>({discord:{version:"test-version",build:"123"},bunny:{version:"test-classic"},token:"must-not-copy"})};
  s.plugin.onLoad();await tick();s.rendered(CHAT).props.children[0].props.onLoad();s.select(null);s.button("Kopiuj diagnostykę").props.onPress();await tick();
  const copied=s.copied[0];assert.match(copied,/By DonMillson/);assert.match(copied,/Obraz wczytany: wall.png/);assert.match(copied,/Właściciel serwera: tak/);
  for(const secret of ["https://",s.storage.ownerKey,"must-not-copy"])assert.equal(copied.includes(secret),false);s.plugin.onUnload();
});
test("image errors restore original messages; unload restores patches, timers and listeners",async()=>{
  const s=setup();s.plugin.onLoad();await tick();s.rendered(CHAT).props.children[0].props.onError();assert.equal(s.rendered(CHAT),s.tree);
  s.plugin.onUnload();assert.equal(s.Messages.render,s.original);assert.equal(s.timers.size,0);assert.equal(s.subscriptions.size,0);
  s.plugin.onLoad();await tick();assert.equal(s.rendered(CHAT).props.children[0].type,"Image");s.plugin.onUnload();
});
test("lazily loaded stores recover; missing native pickers do not block wallpaper reading",async()=>{
  const s=setup(), finder=s.api.metro.findByStoreName;s.api.metro.findByStoreName=()=>undefined;s.plugin.onLoad();assert.equal(s.Messages.render,s.original);
  const retry=Array.from(s.timers).find(t=>t.ms===3000);assert.ok(retry);s.api.metro.findByStoreName=finder;s.timers.delete(retry);retry.fn();await tick();
  assert.equal(s.rendered(CHAT).props.children[0].type,"Image");
  s.api.metro.findByProps=()=>undefined;s.button("Wybierz grafikę z plików").props.onPress();await tick();
  assert.ok(walk(s.settingsView(),node=>node.type==="Text"&&String(node.props.children).includes("wybór plików jest niedostępny")));s.plugin.onUnload();
});
