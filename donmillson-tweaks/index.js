(function(exports,pluginApi,metro,patcher,common,uiComponents,storageApi,toasts){
"use strict";

var storage=pluginApi.storage;
var React=common.React;
var RN=common.ReactNative;
var Forms=uiComponents.Forms;
var General=uiComponents.General;
var FormSection=Forms.FormSection;
var FormSwitchRow=Forms.FormSwitchRow;
var FormRadioRow=Forms.FormRadioRow;
var FormInput=Forms.FormInput;
var FormRow=Forms.FormRow;
var ScrollView=General.ScrollView;
var unpatches=[];
var patchedTypingComponents=typeof WeakSet!=="undefined"?new WeakSet():null;
var CUSTOM_SKU="donmillson-local-decoration";
var CUSTOM_ASSET="donmillson_custom_decoration";

function defaults(){
  storage.typingEnabled ??= true;
  storage.typingStyle ??= "custom";
  storage.customTypingText ??= "nawija";
  storage.customTypingPlural ??= "nawijają";
  storage.bannerEnabled ??= false;
  storage.bannerMedia ??= null;
  storage.decorationEnabled ??= false;
  storage.decorationMedia ??= null;
  storage.nickColorEnabled ??= false;
  storage.nickColor ??= "#b96cff";
}

function showToast(msg){
  try{toasts&&toasts.showToast&&toasts.showToast(msg)}catch(_){}
}

function safeUnpatch(fn){try{fn&&fn()}catch(_){}}

function currentUserStore(){
  try{return metro.findByStoreName("UserStore")}catch(_){return null}
}
function currentId(){
  try{
    var s=currentUserStore();
    return s&&s.getCurrentUser&&s.getCurrentUser()?.id||null;
  }catch(_){return null}
}

function mediaUri(key){
  var m=storage[key];
  if(!m) return "";
  if(typeof m==="string") return m;
  return String(m.fileCopyUri||m.uri||"");
}
function mediaName(key){
  var m=storage[key];
  if(!m||typeof m==="string") return m?"Wybrany plik":"";
  return String(m.fileName||m.name||"Wybrany obraz");
}
function mediaType(key){
  var m=storage[key];
  if(!m||typeof m==="string") return "";
  return String(m.type||"").toLowerCase();
}
function saveMedia(key,asset){
  if(!asset) return false;
  var uri=asset.fileCopyUri||asset.uri||asset.localUri;
  if(!uri) throw new Error("Nie udało się odczytać wybranego pliku.");
  var type=String(asset.type||asset.mimeType||"").toLowerCase();
  if(type&&type.indexOf("image/")!==0) throw new Error("Wybierz plik graficzny.");
  storage[key]={
    uri:String(uri),
    fileCopyUri:asset.fileCopyUri?String(asset.fileCopyUri):undefined,
    fileName:String(asset.fileName||asset.name||"Wybrany obraz"),
    type:type
  };
  refreshDiscord();
  return true;
}

async function pickFile(key){
  var picker=null;
  try{picker=metro.findByProps("pickSingle","isCancel")}catch(_){}
  if(picker&&picker.pickSingle){
    try{
      var asset=await picker.pickSingle({
        type:picker.types?.images||"image/*",
        mode:"import",
        copyTo:"documentDirectory"
      });
      return saveMedia(key,asset);
    }catch(e){
      if(picker.isCancel&&picker.isCancel(e)) return false;
      throw e;
    }
  }

  var docs=null;
  try{docs=metro.findByProps("pick","saveDocuments")}catch(_){}
  if(docs&&docs.pick){
    var result=await docs.pick({
      type:docs.types?.images||["image/*"],
      allowVirtualFiles:true,
      mode:"import"
    });
    var picked=Array.isArray(result)?result[0]:result;
    if(!picked) return false;

    if(docs.keepLocalCopy&&picked.uri){
      var kept=await docs.keepLocalCopy({
        files:[{fileName:picked.name||"image.png",uri:picked.uri}],
        destination:"documentDirectory"
      });
      if(kept&&kept[0]&&kept[0].status==="success"){
        picked.fileCopyUri=kept[0].localUri;
      }
    }
    return saveMedia(key,picked);
  }

  throw new Error("Systemowy wybór plików nie jest dostępny w tej wersji Discorda.");
}

async function pickPhoto(key){
  var picker=null;
  try{picker=metro.findByProps("launchImageLibrary")}catch(_){}
  if(!picker||!picker.launchImageLibrary) return pickFile(key);

  var result=await new Promise(function(resolve,reject){
    try{
      var ret=picker.launchImageLibrary({
        mediaType:"photo",
        selectionLimit:1,
        includeBase64:false,
        assetRepresentationMode:"current"
      },resolve);
      if(ret&&typeof ret.then==="function") ret.then(resolve,reject);
    }catch(e){reject(e)}
  });

  if(result&&result.didCancel) return false;
  if(result&&result.errorCode) throw new Error(result.errorMessage||"Nie udało się otworzyć galerii.");
  var asset=result&&result.assets&&result.assets[0];
  if(!asset) return false;
  return saveMedia(key,asset);
}

function normalizeHex(value){
  var s=String(value||"").trim();
  if(!s) return null;
  if(s[0]!=="#") s="#"+s;
  if(/^#[0-9a-f]{3}$/i.test(s)){
    s="#"+s[1]+s[1]+s[2]+s[2]+s[3]+s[3];
  }
  return /^#[0-9a-f]{6}$/i.test(s)?s.toLowerCase():null;
}
function hexToInt(value){
  var h=normalizeHex(value);
  return h?parseInt(h.slice(1),16):null;
}

function singularWord(){
  if(storage.typingStyle==="papla") return "papla";
  if(storage.typingStyle==="szczeka") return "szczeka";
  return String(storage.customTypingText||"nawija").trim()||"nawija";
}
function pluralWord(){
  if(storage.typingStyle==="papla") return "paplają";
  if(storage.typingStyle==="szczeka") return "szczekają";
  return String(storage.customTypingPlural||"nawijają").trim()||"nawijają";
}
function replaceTypingString(text){
  if(!storage.typingEnabled||typeof text!=="string") return text;
  var s=singularWord();
  var p=pluralWord();
  var out=text;
  out=out.replace(/\bpisze\b/giu,s);
  out=out.replace(/\bpiszą\b/giu,p);
  out=out.replace(/\bis typing\b/giu,s);
  out=out.replace(/\bare typing\b/giu,p);
  return out;
}
function replaceTypingTree(node,depth){
  if(depth>14||node==null) return node;
  if(typeof node==="string") return replaceTypingString(node);
  if(Array.isArray(node)){
    for(var i=0;i<node.length;i++) node[i]=replaceTypingTree(node[i],depth+1);
    return node;
  }
  if(typeof node!=="object") return node;

  try{
    if(node.props&&Object.prototype.hasOwnProperty.call(node.props,"children")){
      node.props.children=replaceTypingTree(node.props.children,depth+1);
    }
  }catch(_){}
  return node;
}

function patchTypingIndicator(){
  var wrapper=null;
  try{wrapper=metro.findByProps("TYPING_WRAPPER_HEIGHT")}catch(_){}
  if(!wrapper||typeof wrapper.default!=="function") return;

  unpatches.push(patcher.after("default",wrapper,function(_args,res){
    replaceTypingTree(res,0);
    try{
      var Typing=res&&res.props&&res.props.children;
      if(Typing&&typeof Typing.type==="function"){
        if(!patchedTypingComponents||!patchedTypingComponents.has(Typing)){
          var up=patcher.after("type",Typing,function(_a,inner){
            return replaceTypingTree(inner,0);
          });
          unpatches.push(up);
          if(patchedTypingComponents) patchedTypingComponents.add(Typing);
        }
      }
    }catch(_){}
    return res;
  }));
}

function cloneObject(obj){
  if(!obj||typeof obj!=="object") return obj;
  try{
    var c=Object.create(Object.getPrototypeOf(obj));
    Reflect.ownKeys(obj).forEach(function(k){
      try{
        var d=Object.getOwnPropertyDescriptor(obj,k);
        if(d) Object.defineProperty(c,k,d);
      }catch(_){}
    });
    return c;
  }catch(_){
    try{return Object.assign({},obj)}catch(__){return obj}
  }
}

function refreshDiscord(){
  try{currentUserStore()?.emitChange?.()}catch(_){}
  try{metro.findByStoreName("UserProfileStore")?.emitChange?.()}catch(_){}
  try{metro.findByStoreName("GuildMemberStore")?.emitChange?.()}catch(_){}
  try{
    var d=metro.findByProps("dispatch","subscribe");
    d?.dispatch?.({type:"CURRENT_USER_UPDATE"});
    var id=currentId();
    if(id) d?.dispatch?.({type:"USER_PROFILE_UPDATE",userId:id});
  }catch(_){}
}

function patchProfileMedia(){
  var UserStore=currentUserStore();
  var ProfileStore=null;
  var bannerResolver=null;
  var decorationResolver=null;
  var decorationUtils=null;

  try{ProfileStore=metro.findByStoreName("UserProfileStore")}catch(_){}
  try{bannerResolver=metro.findByProps("default","getUserBannerURL")}catch(_){}
  try{decorationResolver=metro.findByProps("getAvatarDecorationURL","default")||metro.findByProps("getAvatarDecorationURL")}catch(_){}
  try{decorationUtils=metro.findByProps("isAnimatedAvatarDecoration")}catch(_){}

  function applyUser(user){
    if(!user) return user;
    var id=currentId();
    if(!id||user.id!==id) return user;
    var copy=user;

    if(storage.decorationEnabled&&mediaUri("decorationMedia")){
      copy=cloneObject(copy);
      var deco={asset:CUSTOM_ASSET,skuId:CUSTOM_SKU};
      try{copy.avatarDecoration=deco}catch(_){}
      try{copy.avatarDecorationData=deco}catch(_){}
    }
    return copy;
  }

  function applyProfile(profile,userId){
    if(!profile) return profile;
    var id=currentId();
    if(id&&userId&&String(userId)!==String(id)) return profile;
    var banner=mediaUri("bannerMedia");
    if(!storage.bannerEnabled||!banner) return profile;
    var copy=cloneObject(profile);
    try{copy.banner=banner}catch(_){}
    try{copy.bannerURL=banner}catch(_){}
    try{copy.bannerUrl=banner}catch(_){}
    return copy;
  }

  if(UserStore){
    if(typeof UserStore.getUser==="function"){
      unpatches.push(patcher.after("getUser",UserStore,function(_args,ret){return applyUser(ret)}));
    }
    if(typeof UserStore.getCurrentUser==="function"){
      unpatches.push(patcher.after("getCurrentUser",UserStore,function(_args,ret){return applyUser(ret)}));
    }
  }

  if(ProfileStore){
    if(typeof ProfileStore.getUserProfile==="function"){
      unpatches.push(patcher.after("getUserProfile",ProfileStore,function(args,ret){
        return applyProfile(ret,args&&args[0]);
      }));
    }
    if(typeof ProfileStore.getGuildMemberProfile==="function"){
      unpatches.push(patcher.after("getGuildMemberProfile",ProfileStore,function(args,ret){
        return applyProfile(ret,args&&args[0]);
      }));
    }
  }

  if(bannerResolver&&typeof bannerResolver.getUserBannerURL==="function"){
    unpatches.push(patcher.after("getUserBannerURL",bannerResolver,function(args,ret){
      var user=args&&args[0];
      var banner=mediaUri("bannerMedia");
      if(storage.bannerEnabled&&banner&&user&&user.id===currentId()) return banner;
      return ret;
    }));
  }

  if(decorationResolver&&typeof decorationResolver.getAvatarDecorationURL==="function"){
    unpatches.push(patcher.instead("getAvatarDecorationURL",decorationResolver,function(args,orig){
      try{
        var opts=args&&args[0];
        var deco=opts&&opts.avatarDecoration;
        var uri=mediaUri("decorationMedia");
        if(storage.decorationEnabled&&uri&&deco&&deco.skuId===CUSTOM_SKU) return uri;
      }catch(_){}
      return orig.apply(this,args);
    }));
  }

  if(decorationUtils&&typeof decorationUtils.isAnimatedAvatarDecoration==="function"){
    unpatches.push(patcher.after("isAnimatedAvatarDecoration",decorationUtils,function(args,ret){
      var deco=args&&args[0];
      if(deco&&deco.skuId===CUSTOM_SKU){
        var n=mediaName("decorationMedia").toLowerCase();
        var t=mediaType("decorationMedia");
        return t.indexOf("gif")!==-1||/\.(gif|webp|apng)$/i.test(n);
      }
      return ret;
    }));
  }
}

function applyNickColorToMessage(message){
  if(!message||!storage.nickColorEnabled) return;
  var id=currentId();
  var authorId=message.authorId||message.author?.id||message.message?.authorId;
  if(!id||String(authorId)!==String(id)) return;
  var hex=normalizeHex(storage.nickColor);
  var dec=hexToInt(storage.nickColor);
  if(!hex||dec==null) return;
  try{message.roleColor=hex}catch(_){}
  try{message.usernameColor=hex}catch(_){}
  try{message.colorString=hex}catch(_){}
  try{message.color=dec}catch(_){}
  try{message.shouldShowRoleOnName=true}catch(_){}
}

function patchNickColor(){
  var GuildMemberStore=null;
  try{GuildMemberStore=metro.findByStoreName("GuildMemberStore")}catch(_){}
  if(GuildMemberStore&&typeof GuildMemberStore.getMember==="function"){
    unpatches.push(patcher.after("getMember",GuildMemberStore,function(args,ret){
      if(!ret||!storage.nickColorEnabled) return ret;
      var userId=args&&args[1];
      var id=currentId();
      var hex=normalizeHex(storage.nickColor);
      if(!id||String(userId)!==String(id)||!hex) return ret;
      var copy=cloneObject(ret);
      try{copy.colorString=hex}catch(_){}
      try{copy.color=hexToInt(hex)}catch(_){}
      return copy;
    }));
  }

  var RowManager=null;
  try{RowManager=metro.findByName("RowManager")}catch(_){}
  if(RowManager&&RowManager.prototype&&typeof RowManager.prototype.generate==="function"){
    unpatches.push(patcher.after("generate",RowManager.prototype,function(_args,ret){
      try{
        if(ret&&ret.message) applyNickColorToMessage(ret.message);
        if(ret&&ret.message&&ret.message.referencedMessage&&ret.message.referencedMessage.message){
          applyNickColorToMessage(ret.message.referencedMessage.message);
        }
      }catch(_){}
      return ret;
    }));
  }

  try{
    var nm=RN&&RN.NativeModules;
    var chat=nm&&(nm.DCDChatManager||nm.NativeChatModule);
    if(chat&&typeof chat.updateRows==="function"){
      unpatches.push(patcher.before("updateRows",chat,function(args){
        if(!storage.nickColorEnabled||!args||typeof args[1]!=="string") return args;
        try{
          var rows=JSON.parse(args[1]);
          if(Array.isArray(rows)){
            rows.forEach(function(row){
              if(row&&row.message) applyNickColorToMessage(row.message);
              if(row&&row.message&&row.message.referencedMessage&&row.message.referencedMessage.message){
                applyNickColorToMessage(row.message.referencedMessage.message);
              }
            });
            args[1]=JSON.stringify(rows);
          }
        }catch(_){}
        return args;
      }));
    }
  }catch(_){}
}

function PreviewImage(props){
  if(!props.uri||!RN||!RN.Image) return null;
  return React.createElement(RN.View,{style:{paddingHorizontal:12,paddingBottom:12}},
    React.createElement(RN.Image,{
      source:{uri:props.uri},
      resizeMode:props.banner?"cover":"contain",
      style:props.banner
        ?{width:"100%",height:110,borderRadius:10,backgroundColor:"#111"}
        :{width:150,height:150,alignSelf:"center",backgroundColor:"transparent"}
    })
  );
}

function PickerRows(props){
  var keyName=props.keyName;
  var label=props.label;
  var banner=!!props.banner;
  var uri=mediaUri(keyName);
  async function choose(fn){
    try{
      var ok=await fn(keyName);
      if(ok){
        props.refresh();
        showToast(label+" ustawiony.");
      }
    }catch(e){
      showToast((e&&e.message)||"Nie udało się wybrać pliku.");
    }
  }
  return React.createElement(React.Fragment,null,
    React.createElement(FormRow,{
      label:"Wybierz "+label+" z galerii",
      subLabel:uri?mediaName(keyName):"Brak wybranego pliku",
      onPress:function(){choose(pickPhoto)}
    }),
    React.createElement(FormRow,{
      label:"Wybierz "+label+" z plików",
      onPress:function(){choose(pickFile)}
    }),
    uri?React.createElement(FormRow,{
      label:"Usuń "+label,
      onPress:function(){
        storage[keyName]=null;
        refreshDiscord();
        props.refresh();
      }
    }):null,
    React.createElement(PreviewImage,{uri:uri,banner:banner})
  );
}

function Settings(){
  storageApi.useProxy(storage);
  var state=React.useReducer(function(x){return x+1},0);
  var forceUpdate=state[1];

  function setStyle(style){storage.typingStyle=style;forceUpdate()}
  function setColor(hex){storage.nickColor=hex;storage.nickColorEnabled=true;refreshDiscord();forceUpdate()}

  return React.createElement(ScrollView,{style:{flex:1},contentContainerStyle:{paddingBottom:48}},
    React.createElement(FormSection,{title:"Tekst pisania"},
      React.createElement(FormSwitchRow,{
        label:"Własny tekst zamiast „pisze…”",
        subLabel:"Działa tylko w aplikacji, w której zainstalowano plugin.",
        value:!!storage.typingEnabled,
        onValueChange:function(v){storage.typingEnabled=v;forceUpdate()}
      }),
      React.createElement(FormRadioRow,{label:"Nawija",subLabel:"np. DonMillson nawija…",selected:storage.typingStyle==="custom"&&storage.customTypingText==="nawija",onPress:function(){storage.customTypingText="nawija";storage.customTypingPlural="nawijają";setStyle("custom")}}),
      React.createElement(FormRadioRow,{label:"Papla",selected:storage.typingStyle==="papla",onPress:function(){setStyle("papla")}}),
      React.createElement(FormRadioRow,{label:"Szczeka",selected:storage.typingStyle==="szczeka",onPress:function(){setStyle("szczeka")}}),
      React.createElement(FormRadioRow,{label:"Własny tekst",selected:storage.typingStyle==="custom"&&storage.customTypingText!=="nawija",onPress:function(){setStyle("custom")}}),
      React.createElement(FormRow,{label:"Tekst dla jednej osoby"}),
      React.createElement(FormInput,{title:"",placeholder:"np. nawija",value:storage.customTypingText,onChange:function(v){storage.customTypingText=v;storage.typingStyle="custom";forceUpdate()},style:{marginTop:-20,marginHorizontal:12}}),
      React.createElement(FormRow,{label:"Tekst dla kilku osób"}),
      React.createElement(FormInput,{title:"",placeholder:"np. nawijają",value:storage.customTypingPlural,onChange:function(v){storage.customTypingPlural=v;storage.typingStyle="custom";forceUpdate()},style:{marginTop:-20,marginHorizontal:12}})
    ),

    React.createElement(FormSection,{title:"Kolor nicku (lokalny)"},
      React.createElement(FormSwitchRow,{
        label:"Własny kolor nicku",
        subLabel:"Kolor wiadomości/nicku widoczny lokalnie w Revenge.",
        value:!!storage.nickColorEnabled,
        onValueChange:function(v){storage.nickColorEnabled=v;refreshDiscord();forceUpdate()}
      }),
      React.createElement(FormRadioRow,{label:"Fioletowy",selected:normalizeHex(storage.nickColor)==="#b96cff",onPress:function(){setColor("#b96cff")}}),
      React.createElement(FormRadioRow,{label:"Różowy",selected:normalizeHex(storage.nickColor)==="#ff4fc3",onPress:function(){setColor("#ff4fc3")}}),
      React.createElement(FormRadioRow,{label:"Niebieski",selected:normalizeHex(storage.nickColor)==="#4da3ff",onPress:function(){setColor("#4da3ff")}}),
      React.createElement(FormRadioRow,{label:"Zielony",selected:normalizeHex(storage.nickColor)==="#57f287",onPress:function(){setColor("#57f287")}}),
      React.createElement(FormRadioRow,{label:"Czerwony",selected:normalizeHex(storage.nickColor)==="#ed4245",onPress:function(){setColor("#ed4245")}}),
      React.createElement(FormRadioRow,{label:"Pomarańczowy",selected:normalizeHex(storage.nickColor)==="#ff9f43",onPress:function(){setColor("#ff9f43")}}),
      React.createElement(FormRow,{label:"Własny kolor HEX"}),
      React.createElement(FormInput,{title:"",placeholder:"#b96cff",value:String(storage.nickColor||""),onChange:function(v){storage.nickColor=v;forceUpdate()},style:{marginTop:-20,marginHorizontal:12}}),
      React.createElement(FormRow,{label:"Zastosuj kolor",onPress:function(){
        if(!normalizeHex(storage.nickColor)){showToast("Nieprawidłowy kolor HEX.");return}
        storage.nickColorEnabled=true;refreshDiscord();forceUpdate();showToast("Kolor nicku zastosowany.");
      }})
    ),

    React.createElement(FormSection,{title:"Banner profilu z pliku (lokalny)"},
      React.createElement(FormSwitchRow,{
        label:"Własny banner",
        subLabel:"Bez URL — wybierz obraz z telefonu.",
        value:!!storage.bannerEnabled,
        onValueChange:function(v){storage.bannerEnabled=v;refreshDiscord();forceUpdate()}
      }),
      React.createElement(PickerRows,{keyName:"bannerMedia",label:"banner",banner:true,refresh:forceUpdate})
    ),

    React.createElement(FormSection,{title:"Dekoracja avatara z pliku (lokalna)"},
      React.createElement(FormSwitchRow,{
        label:"Własna dekoracja",
        subLabel:"Najlepiej PNG/APNG/WEBP z przezroczystym tłem.",
        value:!!storage.decorationEnabled,
        onValueChange:function(v){storage.decorationEnabled=v;refreshDiscord();forceUpdate()}
      }),
      React.createElement(PickerRows,{keyName:"decorationMedia",label:"dekorację",banner:false,refresh:forceUpdate})
    )
  );
}

function onLoad(){
  defaults();
  patchTypingIndicator();
  patchProfileMedia();
  patchNickColor();
  refreshDiscord();
  showToast("DonMillson Tweaks 0.2 włączony");
}

function onUnload(){
  while(unpatches.length) safeUnpatch(unpatches.pop());
  refreshDiscord();
}

exports.onLoad=onLoad;
exports.onUnload=onUnload;
exports.settings=Settings;
return exports;
})({},vendetta.plugin,vendetta.metro,vendetta.patcher,vendetta.metro.common,vendetta.ui.components,vendetta.storage,vendetta.ui.toasts);
