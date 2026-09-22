(function(exports, metro, common, api, plugin) {
"use strict";
const React=common.React, RN=common.ReactNative, storage=plugin.storage;
storage.diagReport ??= "Jeszcze nie wykonano skanu.";

function safeStore(n){try{return metro.findByStoreName?.(n)||metro.findByStoreNameLazy?.(n)}catch{return null}}
function safeProps(){try{return metro.findByProps?.apply(null,arguments)}catch{return null}}

function scan(){
 const out=[],seen={};
 const add=s=>{s=String(s);if(!seen[s]){seen[s]=1;out.push(s)}};
 const stores=["AvatarDecorationStore","CollectiblesStore","PremiumStore","UserStore","UserProfileStore"];
 for(const n of stores){
  try{
   const o=safeStore(n);
   if(!o)continue;
   const keys=Object.keys(o).filter(k=>/avatar|decorat|collect|nitro|premium|effect|entitl|sku|use/i.test(k));
   add(n+" => "+keys.join(", "));
  }catch(e){add(n+" ERROR "+String(e))}
 }
 const props=["canUseAvatarDecorations","canUseAvatarDecoration","canUseCollectibles","getAvatarDecoration","getCollectibles","getEntitlements","getSku"];
 for(const n of props){
  try{
   const o=safeProps(n); if(!o)continue;
   const keys=Object.keys(o).filter(k=>/avatar|decorat|collect|nitro|premium|effect|entitl|sku|use/i.test(k));
   add(n+" => "+keys.join(", "));
  }catch(e){add(n+" ERROR "+String(e))}
 }
 storage.diagReport=out.length?out.join("\n"):"Brak trafień.";
 return storage.diagReport;
}

function Settings(){
 const pair=React.useReducer(x=>x+1,0), forceUpdate=pair[1];
 const Button=({text,onPress})=>React.createElement(RN.Pressable,{
  onPress,
  style:{backgroundColor:"#5865f2",padding:12,borderRadius:8,marginBottom:12}
 },React.createElement(RN.Text,{style:{color:"#fff",textAlign:"center",fontWeight:"800"}},text));

 return React.createElement(RN.ScrollView,{
  style:{flex:1},contentContainerStyle:{padding:16,paddingBottom:50}
 },
  React.createElement(RN.View,{style:{backgroundColor:"#1f1f23",padding:14,borderRadius:12}},
   React.createElement(RN.Text,{style:{color:"#fff",fontSize:18,fontWeight:"900",marginBottom:10}},"FakeNitro Diagnostics 3"),
   React.createElement(RN.Text,{style:{color:"#aaa",lineHeight:18,marginBottom:12}},"Najpierw otwórz ekran dekoracji awatara. Potem wróć tutaj i uruchom skan."),
   React.createElement(Button,{text:"SKANUJ",onPress:()=>{scan();forceUpdate()}}),
   React.createElement(RN.Text,{selectable:true,style:{color:"#ddd",fontSize:12,lineHeight:17}},String(storage.diagReport||""))
  )
 );
}
function onLoad(){try{scan()}catch(e){storage.diagReport="LOAD ERROR: "+String(e)}}
exports.default={onLoad,onUnload:function(){},settings:Settings};
Object.defineProperty(exports,"__esModule",{value:true});return exports;
})({},typeof bunny!=="undefined"&&bunny.metro?bunny.metro:vendetta.metro,typeof bunny!=="undefined"&&bunny.metro?.common?bunny.metro.common:vendetta.metro.common,typeof bunny!=="undefined"&&bunny.api?.patcher?bunny.api:vendetta,vendetta.plugin);