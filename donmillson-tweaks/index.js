(function(exports,pluginApi,metro,patcher,common,uiComponents,storageApi,toasts){
"use strict";

var storage=pluginApi.storage;
var React=common.React;
var Forms=uiComponents.Forms;
var General=uiComponents.General;
var FormSection=Forms.FormSection;
var FormSwitchRow=Forms.FormSwitchRow;
var FormRadioRow=Forms.FormRadioRow;
var FormInput=Forms.FormInput;
var FormRow=Forms.FormRow;
var ScrollView=General.ScrollView;
var unpatches=[];
var directRestores=[];
var patchedFormats=typeof WeakSet!=="undefined"?new WeakSet():null;
var CUSTOM_SKU="donmillson-local-decoration";
var CUSTOM_ASSET="donmillson_custom_decoration";
var typingMessages=null;

function defaults(){
  storage.typingEnabled ??= true;
  storage.typingStyle ??= "papla";
  storage.customTypingText ??= "gada";
  storage.customTypingPlural ??= "gadają";
  storage.bannerEnabled ??= false;
  storage.bannerUrl ??= "";
  storage.decorationEnabled ??= false;
  storage.decorationUrl ??= "";
}

function isHttpUrl(value){
  if(typeof value!=="string"||!value.trim()) return false;
  try{var u=new URL(value.trim());return u.protocol==="http:"||u.protocol==="https:"}catch(_){return false}
}

function singularWord(){
  if(storage.typingStyle==="szczeka") return "szczeka";
  if(storage.typingStyle==="custom") return String(storage.customTypingText||"pisze").trim()||"pisze";
  return "papla";
}
function pluralWord(){
  if(storage.typingStyle==="szczeka") return "szczekają";
  if(storage.typingStyle==="custom") return String(storage.customTypingPlural||storage.customTypingText||"piszą").trim()||"piszą";
  return "paplają";
}
function replaceTypingText(text){
  if(!storage.typingEnabled||typeof text!=="string") return text;
  var s=singularWord(),p=pluralWord();
  return text
    .replace(/\bpisze\b/giu,s)
    .replace(/\bpiszą\b/giu,p)
    .replace(/\bis typing\b/giu,s)
    .replace(/\bare typing\b/giu,p);
}
function transformValue(value){
  if(typeof value==="string") return replaceTypingText(value);
  if(Array.isArray(value)) return value.map(transformValue);
  return value;
}
function safeUnpatch(fn){try{fn&&fn()}catch(_){}}

function patchTyping(){
  try{
    var i18n=metro.findByProps("Messages");
    var Messages=i18n&&i18n.Messages;
    if(!Messages) return;
    typingMessages=Messages;
    Object.keys(Messages).forEach(function(key){
      if(!/TYP/i.test(key)) return;
      var entry;
      try{entry=Messages[key]}catch(_){return}
      if(typeof entry==="function"){
        try{unpatches.push(patcher.after(key,Messages,function(_args,ret){return transformValue(ret)}))}catch(_){ }
        return;
      }
      if(entry&&typeof entry==="object"){
        ["format","formatToParts","toString"].forEach(function(method){
          if(typeof entry[method]!=="function") return;
          if(patchedFormats&&patchedFormats.has(entry[method])) return;
          try{
            var originalFn=entry[method];
            unpatches.push(patcher.after(method,entry,function(_args,ret){return transformValue(ret)}));
            if(patchedFormats) patchedFormats.add(originalFn);
          }catch(_){ }
        });
        return;
      }
      if(typeof entry==="string"){
        var desc=Object.getOwnPropertyDescriptor(Messages,key);
        if(desc&&(desc.writable||desc.set)){
          var old=entry;
          try{Messages[key]=replaceTypingText(old);directRestores.push(function(){try{Messages[key]=old}catch(_){}})}catch(_){ }
        }
      }
    });
  }catch(e){try{pluginApi.logger&&pluginApi.logger.error("DonMillsonTweaks: typing patch failed",e)}catch(_){}}
}
function refreshStaticTyping(){
  if(!typingMessages) return;
  try{
    Object.keys(typingMessages).forEach(function(key){
      if(!/TYP/i.test(key)) return;
      var val=typingMessages[key];
      if(typeof val==="string") typingMessages[key]=replaceTypingText(val.replace(/\b(papla|paplają|szczeka|szczekają|gada|gadają)\b/giu,function(m){return /ją$/iu.test(m)?"piszą":"pisze"}));
    });
  }catch(_){ }
}

function patchBannerAndDecoration(){
  var UserStore=metro.findByStoreName("UserStore");
  var bannerResolver=metro.findByProps("default","getUserBannerURL");
  var decorationResolver=metro.findByProps("getAvatarDecorationURL","default")||metro.findByProps("getAvatarDecorationURL");
  var decorationUtils=metro.findByProps("isAnimatedAvatarDecoration");

  function currentId(){try{return UserStore&&UserStore.getCurrentUser&&UserStore.getCurrentUser()?.id}catch(_){return null}}
  function decorateUser(user){
    if(!user||!storage.decorationEnabled||!isHttpUrl(storage.decorationUrl)) return user;
    var id=currentId();
    if(!id||user.id!==id) return user;
    try{
      var copy=Object.assign(Object.create(Object.getPrototypeOf(user)),user);
      var decoration={asset:CUSTOM_ASSET,skuId:CUSTOM_SKU};
      copy.avatarDecoration=decoration;
      copy.avatarDecorationData=decoration;
      return copy;
    }catch(_){
      return Object.assign({},user,{avatarDecoration:{asset:CUSTOM_ASSET,skuId:CUSTOM_SKU},avatarDecorationData:{asset:CUSTOM_ASSET,skuId:CUSTOM_SKU}});
    }
  }

  if(bannerResolver&&typeof bannerResolver.getUserBannerURL==="function"){
    unpatches.push(patcher.after("getUserBannerURL",bannerResolver,function(args,ret){
      var user=args&&args[0];
      if(storage.bannerEnabled&&isHttpUrl(storage.bannerUrl)&&user&&user.id===currentId()) return String(storage.bannerUrl).trim();
      return ret;
    }));
  }

  if(UserStore){
    if(typeof UserStore.getUser==="function") unpatches.push(patcher.after("getUser",UserStore,function(_args,ret){return decorateUser(ret)}));
    if(typeof UserStore.getCurrentUser==="function") unpatches.push(patcher.after("getCurrentUser",UserStore,function(_args,ret){return decorateUser(ret)}));
  }

  if(decorationResolver&&typeof decorationResolver.getAvatarDecorationURL==="function"){
    unpatches.push(patcher.instead("getAvatarDecorationURL",decorationResolver,function(args,orig){
      try{
        var options=args&&args[0];
        var decor=options&&options.avatarDecoration;
        if(storage.decorationEnabled&&isHttpUrl(storage.decorationUrl)&&decor&&decor.skuId===CUSTOM_SKU) return String(storage.decorationUrl).trim();
      }catch(_){ }
      return orig.apply(this,args);
    }));
  }

  if(decorationUtils&&typeof decorationUtils.isAnimatedAvatarDecoration==="function"){
    unpatches.push(patcher.after("isAnimatedAvatarDecoration",decorationUtils,function(args,ret){
      var decor=args&&args[0];
      if(decor&&decor.skuId===CUSTOM_SKU){
        var url=String(storage.decorationUrl||"");
        return /\.(gif|webp)(?:\?|$)/i.test(url);
      }
      return ret;
    }));
  }
}

function Settings(){
  storageApi.useProxy(storage);
  function setStyle(style){storage.typingStyle=style;refreshStaticTyping()}
  return React.createElement(ScrollView,{style:{flex:1},contentContainerStyle:{paddingBottom:40}},
    React.createElement(FormSection,{title:"Tekst pisania"},
      React.createElement(FormSwitchRow,{label:"Własny tekst zamiast „pisze…”",subLabel:"Zmiana jest tylko po Twojej stronie w aplikacji Revenge.",value:!!storage.typingEnabled,onValueChange:function(v){storage.typingEnabled=v;refreshStaticTyping()}}),
      React.createElement(FormRadioRow,{label:"Papla",subLabel:"np. DonMillson papla…",selected:storage.typingStyle==="papla",onPress:function(){setStyle("papla")}}),
      React.createElement(FormRadioRow,{label:"Szczeka",subLabel:"np. DonMillson szczeka…",selected:storage.typingStyle==="szczeka",onPress:function(){setStyle("szczeka")}}),
      React.createElement(FormRadioRow,{label:"Własny",subLabel:"Użyj tekstu wpisanego niżej",selected:storage.typingStyle==="custom",onPress:function(){setStyle("custom")}}),
      React.createElement(FormRow,{label:"Tekst dla jednej osoby"}),
      React.createElement(FormInput,{title:"",placeholder:"np. nawija",value:storage.customTypingText,onChange:function(v){storage.customTypingText=v;refreshStaticTyping()},style:{marginTop:-20,marginHorizontal:12}}),
      React.createElement(FormRow,{label:"Tekst dla kilku osób"}),
      React.createElement(FormInput,{title:"",placeholder:"np. nawijają",value:storage.customTypingPlural,onChange:function(v){storage.customTypingPlural=v;refreshStaticTyping()},style:{marginTop:-20,marginHorizontal:12}})
    ),
    React.createElement(FormSection,{title:"Banner profilu (lokalny)"},
      React.createElement(FormSwitchRow,{label:"Własny banner",subLabel:"Wyświetlany lokalnie, bez zapisywania Nitro na koncie Discord.",value:!!storage.bannerEnabled,onValueChange:function(v){storage.bannerEnabled=v}}),
      React.createElement(FormInput,{title:"URL bannera",placeholder:"https://.../banner.png",value:storage.bannerUrl,onChange:function(v){storage.bannerUrl=v},style:{marginHorizontal:12}})
    ),
    React.createElement(FormSection,{title:"Dekoracja avatara (lokalna)"},
      React.createElement(FormSwitchRow,{label:"Własna dekoracja",subLabel:"Podaj bezpośredni URL do PNG/WEBP/GIF z przezroczystością.",value:!!storage.decorationEnabled,onValueChange:function(v){storage.decorationEnabled=v}}),
      React.createElement(FormInput,{title:"URL dekoracji",placeholder:"https://.../decoration.png",value:storage.decorationUrl,onChange:function(v){storage.decorationUrl=v},style:{marginHorizontal:12}})
    )
  );
}

function onLoad(){
  defaults();
  patchTyping();
  patchBannerAndDecoration();
  try{toasts&&toasts.showToast&&toasts.showToast("DonMillson Tweaks włączony")}catch(_){ }
}
function onUnload(){
  while(unpatches.length) safeUnpatch(unpatches.pop());
  while(directRestores.length) safeUnpatch(directRestores.pop());
  typingMessages=null;
}

exports.onLoad=onLoad;
exports.onUnload=onUnload;
exports.settings=Settings;
return exports;
})({},vendetta.plugin,vendetta.metro,vendetta.patcher,vendetta.metro.common,vendetta.ui.components,vendetta.storage,vendetta.ui.toasts);
