(function(exports, metro, common, api, plugin) {
"use strict";
const React=common.React, RN=common.ReactNative, storage=plugin.storage;
storage.diagReport ??= "Jeszcze nie wykonano skanu.";

function scan(){
 const hits=[],seen={};
 function add(v){v=String(v);if(!seen[v]){seen[v]=1;hits.push(v)}}
 const probes=[
  ["AvatarDecorationStore"],["CollectiblesStore"],["PremiumStore"],["UserStore"],
  ["canUseAvatarDecorations"],["canUseAvatarDecoration"],["canUseCollectibles"],
  ["getAvatarDecoration"],["getCollectibles"],["getEntitlements"],["getSku"]
 ];
 for(const p of probes){
  try{
   let o=null;
   if(p[0].endsWith("Store")) o=metro.findByStoreName?.(p[0]);
   else o=metro.findByProps?.(p[0]);
   if(o){
    let keys=[];try{keys=Object.keys(o)}catch{}
    add(p[0]+" => "+keys.filter(k=>/avatar|decorat|collect|nitro|premium|effect|entitl|sku|use/i.test(k)).slice(0,80).join(", "));
   }
  }catch(e){add(p[0]+" ERROR "+String(e))}
 }
 storage.diagReport=hits.length?hits.join("\n"):"Brak trafień w bezpiecznym skanie.";
 return storage.diagReport;
}
function Settings(){
 const state=React.useState(0), force=state[1];
 const report=String(storage.diagReport||"");
 const press=()=>{scan();force(x=>x+1)};
 return React.createElement(RN.ScrollView,{contentContainerStyle:{padding:16}},
  React.createElement(RN.Text,{style:{fontSize:22,fontWeight:"700",color:"#fff",marginBottom:12}},"FakeNitro Diagnostics"),
  React.createElement(RN.Text,{style:{color:"#ccc",marginBottom:16,lineHeight:20}},"Otwórz wcześniej ekran dekoracji, wróć tutaj i naciśnij SKANUJ."),
  React.createElement(RN.Pressable,{onPress:press,style:{padding:14,borderRadius:10,backgroundColor:"#5865F2",marginBottom:16}},
   React.createElement(RN.Text,{style:{color:"#fff",fontWeight:"700",textAlign:"center"}},"SKANUJ")),
  React.createElement(RN.Text,{selectable:true,style:{color:"#ddd",fontSize:12,lineHeight:17}},String(storage.diagReport||report))
 );
}
function onLoad(){try{scan()}catch(e){storage.diagReport="LOAD ERROR: "+String(e)}}
exports.default={onLoad,onUnload:function(){},settings:Settings};
Object.defineProperty(exports,"__esModule",{value:true});return exports;
})({},typeof bunny!=="undefined"&&bunny.metro?bunny.metro:vendetta.metro,typeof bunny!=="undefined"&&bunny.metro?.common?bunny.metro.common:vendetta.metro.common,typeof bunny!=="undefined"&&bunny.api?.patcher?bunny.api:vendetta,vendetta.plugin);