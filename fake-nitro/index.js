(function(exports, metro, common, api, plugin) {
"use strict";
const React=common.React, RN=common.ReactNative, storage=plugin.storage;
storage.diagReport ??= "Uruchom skan po wejściu w ekran dekoracji.";
let unpatches=[];
function scan(){
 const hits=[], seen=new Set();
 function add(s){s=String(s);if(!seen.has(s)){seen.add(s);hits.push(s)}}
 try{
  const mods=metro.modules;
  if(mods&&typeof mods==="object"){
   for(const id in mods){
    let ex;try{ex=mods[id]?.publicModule?.exports||mods[id]?.exports}catch{continue}
    for(const o of [ex,ex?.default]){
     if(!o||(typeof o!=="object"&&typeof o!=="function"))continue;
     let keys=[];try{keys=Object.keys(o)}catch{}
     for(const k of keys){
      if(/avatar|decorat|collect|nitro|premium|profile.?effect|entitl|sku/i.test(k)) add(id+" :: "+k+" ["+typeof o[k]+"]");
     }
    }
   }
  }
 }catch(e){add("SCAN ERROR: "+e)}
 storage.diagReport=hits.length?hits.slice(0,250).join("\n"):"Nie znaleziono pasujących eksportów.";
 return storage.diagReport;
}
function copy(text){
 try{const c=metro.findByProps?.("setString");if(c?.setString){c.setString(String(text));return true}}catch{}
 try{RN.Clipboard?.setString?.(String(text));return true}catch{}
 return false;
}
function toast(s){try{api.ui?.toasts?.showToast?.(String(s))}catch{try{vendetta.ui.toasts.showToast(String(s))}catch{}}}
function Settings(){
 const [,force]=React.useReducer(x=>x+1,0);
 const Button=common.components?.Button||metro.findByName?.("Button");
 return React.createElement(RN.ScrollView,{contentContainerStyle:{padding:16,gap:12}},
  React.createElement(RN.Text,{style:{fontSize:22,fontWeight:"700",color:"#fff"}},"FakeNitro Diagnostics"),
  React.createElement(RN.Text,{style:{color:"#ccc",lineHeight:20}},"Wejdź najpierw w Profil → Zmień dekorację awatara, wróć tutaj i naciśnij Skanuj. Raport pokaże moduły Discorda związane z dekoracjami/Nitro."),
  Button?React.createElement(Button,{text:"Skanuj moduły",onPress:()=>{scan();force();toast("Skan zakończony")}}):React.createElement(RN.Pressable,{onPress:()=>{scan();force()}},React.createElement(RN.Text,{style:{color:"#5aa7ff"}},"Skanuj moduły")),
  Button?React.createElement(Button,{text:"Kopiuj raport",onPress:()=>toast(copy(storage.diagReport)?"Raport skopiowany":"Nie udało się skopiować")}):null,
  React.createElement(RN.Text,{selectable:true,style:{color:"#ddd",fontFamily:"monospace",fontSize:11,lineHeight:15}},String(storage.diagReport||""))
 );
}
function onLoad(){scan()}
function onUnload(){for(const u of unpatches)try{u?.()}catch{}unpatches=[]}
exports.default={onLoad,onUnload,settings:Settings};
Object.defineProperty(exports,"__esModule",{value:true});return exports;
})({},typeof bunny!=="undefined"&&bunny.metro?bunny.metro:vendetta.metro,typeof bunny!=="undefined"&&bunny.metro?.common?bunny.metro.common:vendetta.metro.common,typeof bunny!=="undefined"&&bunny.api?.patcher?bunny.api:vendetta,vendetta.plugin);