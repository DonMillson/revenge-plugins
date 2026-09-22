(function(exports, metro, common, api, plugin) {
"use strict";
const React=common.React,RN=common.ReactNative,storage=plugin.storage;
let unpatches=[];
function byProps(){try{return metro.findByProps?.apply(null,arguments)}catch{return null}}
function patchTrue(obj,key){
 try{
  if(!obj||typeof obj[key]!=="function")return false;
  const p=api.patcher||api;
  const u=p.instead(key,obj,()=>true); if(typeof u==="function")unpatches.push(u);
  return true;
 }catch{return false}
}
function apply(){
 let n=0;
 const caps=byProps("canUseCollectibles");
 for(const k of ["canUseCollectibles","canUsePremiumProfileCustomization","canUseAnimatedAvatar"])
   if(patchTrue(caps,k))n++;
 const deco=byProps("useAvatarDecoration","getAvatarDecoration");
 for(const k of ["useAvatarDecoration"])
   if(patchTrue(deco,k))n++;
 storage.status="Aktywne patche: "+n+". Uruchom ponownie ekran Profil → dekoracja awatara.";
 return n;
}
function Settings(){
 const [,force]=React.useReducer(x=>x+1,0);
 const Button=({text,onPress})=>React.createElement(RN.Pressable,{onPress,style:{backgroundColor:"#5865f2",padding:12,borderRadius:8,marginBottom:12}},React.createElement(RN.Text,{style:{color:"#fff",textAlign:"center",fontWeight:"800"}},text));
 return React.createElement(RN.ScrollView,{style:{flex:1},contentContainerStyle:{padding:16,paddingBottom:50}},
  React.createElement(RN.View,{style:{backgroundColor:"#1f1f23",padding:14,borderRadius:12}},
   React.createElement(RN.Text,{style:{color:"#fff",fontSize:18,fontWeight:"900",marginBottom:10}},"FakeNitro Avatar Patch v4"),
   React.createElement(RN.Text,{style:{color:"#aaa",lineHeight:18,marginBottom:12}},"Diagnostyka znalazła moduł capability Discorda. Ten build patchuje lokalne kontrole Collectibles/Profile Customization."),
   React.createElement(Button,{text:"ZASTOSUJ PATCH",onPress:()=>{apply();force()}}),
   React.createElement(RN.Text,{style:{color:"#ddd",fontSize:13}},String(storage.status||"Patch zostanie zastosowany także przy starcie."))
  ));
}
function onLoad(){apply()}
function onUnload(){for(const u of unpatches.splice(0))try{u()}catch{}}
exports.default={onLoad,onUnload,settings:Settings};
Object.defineProperty(exports,"__esModule",{value:true});return exports;
})({},typeof bunny!=="undefined"&&bunny.metro?bunny.metro:vendetta.metro,typeof bunny!=="undefined"&&bunny.metro?.common?bunny.metro.common:vendetta.metro.common,typeof bunny!=="undefined"&&bunny.api?.patcher?bunny.api:vendetta,vendetta.plugin);