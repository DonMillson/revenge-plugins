(function(exports, metro, common, api, plugin) {
"use strict";
const React=common.React,RN=common.ReactNative,storage=plugin.storage;
storage.decorUrl ??=""; storage.syncTag ??="";
let unpatches=[];
function byProps(){try{return metro.findByProps?.apply(null,arguments)}catch{return null}}
function patchAfter(obj,key,cb){try{const p=api.patcher||api;if(!obj||typeof obj[key]!=="function")return false;const u=p.after(key,obj,cb);if(typeof u==="function")unpatches.push(u);return true}catch{return false}}
function patchTrue(obj,key){try{const p=api.patcher||api;if(!obj||typeof obj[key]!=="function")return false;const u=p.instead(key,obj,()=>true);if(typeof u==="function")unpatches.push(u);return true}catch{return false}}
function me(){try{return (metro.findByStoreName?.("UserStore")||byProps("getCurrentUser"))?.getCurrentUser?.()}catch{return null}}
function apply(){
 let n=0; const caps=byProps("canUseCollectibles");
 for(const k of ["canUseCollectibles","canUsePremiumProfileCustomization"])if(patchTrue(caps,k))n++;
 // Receiver side: when a compatible client sees a profile carrying our marker in bio,
 // expose the marker to settings/status. Rendering hook is deliberately local only.
 const profile=metro.findByStoreName?.("UserProfileStore")||byProps("getUserProfile");
 if(profile&&patchAfter(profile,"getUserProfile",(_,args,res)=>{
   try{const bio=String(res?.bio||res?.user?.bio||"");const m=bio.match(/\[FNDEC:([^\]]+)\]/);if(m)res.__fakeNitroDecoration=decodeURIComponent(m[1])}catch{}
 }))n++;
 storage.status="FakeNitro Sync aktywny. Patche: "+n;
}
function marker(){return storage.decorUrl?"[FNDEC:"+encodeURIComponent(storage.decorUrl)+"]":""}
function Settings(){
 const [,force]=React.useReducer(x=>x+1,0);
 const Input=RN.TextInput;
 const Button=({text,onPress})=>React.createElement(RN.Pressable,{onPress,style:{backgroundColor:"#5865f2",padding:12,borderRadius:8,marginBottom:10}},React.createElement(RN.Text,{style:{color:"#fff",textAlign:"center",fontWeight:"800"}},text));
 return React.createElement(RN.ScrollView,{style:{flex:1},contentContainerStyle:{padding:16,paddingBottom:50}},
  React.createElement(RN.View,{style:{backgroundColor:"#1f1f23",padding:14,borderRadius:12}},
   React.createElement(RN.Text,{style:{color:"#fff",fontSize:19,fontWeight:"900",marginBottom:8}},"FakeNitro Shared Decorations v5"),
   React.createElement(RN.Text,{style:{color:"#aaa",lineHeight:18,marginBottom:12}},"Wklej URL grafiki dekoracji. Użytkownicy z tym samym pluginem mogą odczytać znacznik dekoracji z Twojego bio. Zwykły Discord go nie renderuje."),
   React.createElement(Input,{value:String(storage.decorUrl||""),onChangeText:v=>{storage.decorUrl=v;force()},placeholder:"https://.../decoration.png",placeholderTextColor:"#777",autoCapitalize:"none",style:{backgroundColor:"#111",color:"#fff",padding:11,borderRadius:8,marginBottom:10}}),
   React.createElement(RN.Text,{selectable:true,style:{color:"#ddd",fontSize:12,marginBottom:12}},"Znacznik do bio:\n"+marker()),
   React.createElement(Button,{text:"ODŚWIEŻ PATCH",onPress:()=>{apply();force()}}),
   React.createElement(RN.Text,{style:{color:"#aaa",fontSize:12}},String(storage.status||""))
  ));
}
function onLoad(){apply()}
function onUnload(){for(const u of unpatches.splice(0))try{u()}catch{}}
exports.default={onLoad,onUnload,settings:Settings};
Object.defineProperty(exports,"__esModule",{value:true});return exports;
})({},typeof bunny!=="undefined"&&bunny.metro?bunny.metro:vendetta.metro,typeof bunny!=="undefined"&&bunny.metro?.common?bunny.metro.common:vendetta.metro.common,typeof bunny!=="undefined"&&bunny.api?.patcher?bunny.api:vendetta,vendetta.plugin);