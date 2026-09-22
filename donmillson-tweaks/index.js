(function(exports,vendetta){
"use strict";

var storage = vendetta.plugin.storage;
var metro = vendetta.metro;
var patcher = vendetta.patcher;
var React = metro.common.React;
var RN = metro.common.ReactNative;
var unpatches = [];
var myUserId = null;
var CUSTOM_SKU = "donmillson-local-decoration";
var CUSTOM_ASSET = "donmillson_custom_decoration";

function toast(msg){
  try{ vendetta.ui.toasts.showToast(String(msg)); }catch(_){}
}

function logError(where, e){
  try{ vendetta.logger.error("[DonMillson Tweaks] "+where, e); }catch(_){}
}

function defaults(){
  storage.bannerEnabled ??= false;
  storage.bannerMedia ??= null;
  storage.decorationEnabled ??= false;
  storage.decorationMedia ??= null;
  storage.nickColorEnabled ??= false;
  storage.nickColor ??= "#b96cff";
}

function cloneObject(obj){
  if(!obj || typeof obj!=="object") return obj;
  try{
    var clone = Object.create(Object.getPrototypeOf(obj));
    Reflect.ownKeys(obj).forEach(function(k){
      try{
        var d = Object.getOwnPropertyDescriptor(obj,k);
        if(d) Object.defineProperty(clone,k,d);
      }catch(_){}
    });
    return clone;
  }catch(_){
    try{return Object.assign({},obj)}catch(__){return obj}
  }
}

function setValue(obj,key,value){
  try{
    var d = Object.getOwnPropertyDescriptor(obj,key);
    if(!d || d.configurable){
      Object.defineProperty(obj,key,{
        value:value,writable:true,enumerable:d?!!d.enumerable:true,configurable:true
      });
      return;
    }
    if(d.writable) obj[key]=value;
  }catch(_){
    try{obj[key]=value}catch(__){}
  }
}

function getUserStore(){
  try{return metro.findByStoreName("UserStore")}catch(_){return null}
}

function captureUserId(){
  if(myUserId) return myUserId;
  try{
    var store = getUserStore();
    var user = store && store.getCurrentUser && store.getCurrentUser();
    if(user && user.id) myUserId = String(user.id);
  }catch(e){logError("capture user id",e)}
  return myUserId;
}

function mediaUri(key){
  var m = storage[key];
  if(!m) return "";
  if(typeof m==="string") return m;
  return String(m.fileCopyUri || m.uri || m.localUri || "");
}

function mediaName(key){
  var m = storage[key];
  if(!m) return "";
  if(typeof m==="string") return "Wybrany obraz";
  return String(m.fileName || m.name || "Wybrany obraz");
}

function saveMedia(key, asset){
  if(!asset) return false;
  var uri = asset.fileCopyUri || asset.localUri || asset.uri;
  if(!uri) throw new Error("Nie udało się odczytać pliku.");
  var type = String(asset.type || asset.mimeType || "").toLowerCase();
  if(type && !type.startsWith("image/")) throw new Error("Wybierz obraz.");
  storage[key] = {
    uri:String(uri),
    fileCopyUri: asset.fileCopyUri ? String(asset.fileCopyUri) : undefined,
    localUri: asset.localUri ? String(asset.localUri) : undefined,
    fileName:String(asset.fileName || asset.name || "Wybrany obraz"),
    type:type
  };
  refreshDiscord();
  return true;
}

async function pickFile(key){
  var picker = null;
  try{ picker = metro.findByProps("pickSingle","isCancel"); }catch(_){}
  if(picker && picker.pickSingle){
    try{
      var asset = await picker.pickSingle({
        type: picker.types?.images || "image/*",
        mode:"import",
        copyTo:"documentDirectory"
      });
      return saveMedia(key,asset);
    }catch(e){
      if(picker.isCancel && picker.isCancel(e)) return false;
      throw e;
    }
  }

  var docs = null;
  try{ docs = metro.findByProps("pick","saveDocuments"); }catch(_){}
  if(docs && docs.pick){
    var result = await docs.pick({
      type: docs.types?.images || ["image/*"],
      allowVirtualFiles:true,
      mode:"import"
    });
    var picked = Array.isArray(result) ? result[0] : result;
    if(!picked) return false;

    if(docs.keepLocalCopy && picked.uri){
      try{
        var kept = await docs.keepLocalCopy({
          files:[{fileName:picked.name || "image.png",uri:picked.uri}],
          destination:"documentDirectory"
        });
        if(kept && kept[0] && kept[0].status==="success"){
          picked.fileCopyUri = kept[0].localUri;
        }
      }catch(_){}
    }
    return saveMedia(key,picked);
  }

  throw new Error("W tej wersji Discorda nie znaleziono systemowego wyboru plików.");
}

async function pickPhoto(key){
  var picker = null;
  try{ picker = metro.findByProps("launchImageLibrary"); }catch(_){}
  if(!picker || !picker.launchImageLibrary) return pickFile(key);

  var result = await new Promise(function(resolve,reject){
    try{
      var ret = picker.launchImageLibrary({
        mediaType:"photo",
        selectionLimit:1,
        includeBase64:false,
        assetRepresentationMode:"current"
      },resolve);
      if(ret && typeof ret.then==="function") ret.then(resolve,reject);
    }catch(e){reject(e)}
  });

  if(result && result.didCancel) return false;
  if(result && result.errorCode) throw new Error(result.errorMessage || "Nie udało się otworzyć galerii.");
  var asset = result && result.assets && result.assets[0];
  if(!asset) return false;
  return saveMedia(key,asset);
}

function normalizeHex(value){
  var s = String(value || "").trim();
  if(!s) return null;
  if(s[0]!=="#") s="#"+s;
  if(/^#[0-9a-f]{3}$/i.test(s)){
    s="#"+s[1]+s[1]+s[2]+s[2]+s[3]+s[3];
  }
  return /^#[0-9a-f]{6}$/i.test(s) ? s.toLowerCase() : null;
}

function hexToInt(value){
  var h = normalizeHex(value);
  return h ? parseInt(h.slice(1),16) : null;
}

function refreshDiscord(){
  try{getUserStore()?.emitChange?.()}catch(_){}
  try{metro.findByStoreName("UserProfileStore")?.emitChange?.()}catch(_){}
  try{metro.findByStoreName("GuildMemberStore")?.emitChange?.()}catch(_){}
  try{
    var dispatcher = metro.findByProps("dispatch","subscribe");
    dispatcher?.dispatch?.({type:"CURRENT_USER_UPDATE"});
    if(myUserId) dispatcher?.dispatch?.({type:"USER_PROFILE_UPDATE",userId:myUserId});
  }catch(_){}
}

function patchProfile(){
  var UserStore = getUserStore();
  var ProfileStore = null;
  var bannerResolver = null;
  var decorationResolver = null;
  var decorationUtils = null;
  var GuildMemberStore = null;

  try{ProfileStore = metro.findByStoreName("UserProfileStore")}catch(_){}
  try{bannerResolver = metro.findByProps("default","getUserBannerURL")}catch(_){}
  try{decorationResolver = metro.findByProps("getAvatarDecorationURL","default") || metro.findByProps("getAvatarDecorationURL")}catch(_){}
  try{decorationUtils = metro.findByProps("isAnimatedAvatarDecoration")}catch(_){}
  try{GuildMemberStore = metro.findByStoreName("GuildMemberStore")}catch(_){}

  function decorateUser(user){
    if(!user || !storage.decorationEnabled) return user;
    if(!myUserId || String(user.id)!==String(myUserId)) return user;
    var uri = mediaUri("decorationMedia");
    if(!uri) return user;

    var copy = cloneObject(user);
    var deco = {asset:CUSTOM_ASSET,skuId:CUSTOM_SKU};
    setValue(copy,"avatarDecoration",deco);
    setValue(copy,"avatarDecorationData",deco);
    return copy;
  }

  function decorateProfile(profile,userId){
    if(!profile || !storage.bannerEnabled) return profile;
    if(myUserId && userId && String(userId)!==String(myUserId)) return profile;
    var banner = mediaUri("bannerMedia");
    if(!banner) return profile;

    var copy = cloneObject(profile);
    setValue(copy,"banner",banner);
    setValue(copy,"bannerURL",banner);
    setValue(copy,"bannerUrl",banner);
    return copy;
  }

  if(UserStore){
    if(typeof UserStore.getCurrentUser==="function"){
      unpatches.push(patcher.after("getCurrentUser",UserStore,function(_args,ret){
        try{if(ret && ret.id && !myUserId) myUserId=String(ret.id)}catch(_){}
        return decorateUser(ret);
      }));
    }
    if(typeof UserStore.getUser==="function"){
      unpatches.push(patcher.after("getUser",UserStore,function(_args,ret){
        return decorateUser(ret);
      }));
    }
  }

  if(ProfileStore){
    if(typeof ProfileStore.getUserProfile==="function"){
      unpatches.push(patcher.after("getUserProfile",ProfileStore,function(args,ret){
        return decorateProfile(ret,args && args[0]);
      }));
    }
    if(typeof ProfileStore.getGuildMemberProfile==="function"){
      unpatches.push(patcher.after("getGuildMemberProfile",ProfileStore,function(args,ret){
        return decorateProfile(ret,args && args[0]);
      }));
    }
  }

  if(bannerResolver && typeof bannerResolver.getUserBannerURL==="function"){
    unpatches.push(patcher.after("getUserBannerURL",bannerResolver,function(args,ret){
      try{
        var user = args && args[0];
        var banner = mediaUri("bannerMedia");
        if(storage.bannerEnabled && banner && user && myUserId && String(user.id)===String(myUserId)) return banner;
      }catch(_){}
      return ret;
    }));
  }

  if(decorationResolver && typeof decorationResolver.getAvatarDecorationURL==="function"){
    unpatches.push(patcher.instead("getAvatarDecorationURL",decorationResolver,function(args,orig){
      try{
        var opts = args && args[0];
        var deco = opts && opts.avatarDecoration;
        var uri = mediaUri("decorationMedia");
        if(storage.decorationEnabled && uri && deco && deco.skuId===CUSTOM_SKU) return uri;
      }catch(_){}
      return orig.apply(this,args);
    }));
  }

  if(decorationUtils && typeof decorationUtils.isAnimatedAvatarDecoration==="function"){
    unpatches.push(patcher.after("isAnimatedAvatarDecoration",decorationUtils,function(args,ret){
      try{
        var deco = args && args[0];
        if(deco && deco.skuId===CUSTOM_SKU){
          var n = mediaName("decorationMedia").toLowerCase();
          return /\.(gif|webp|apng)$/i.test(n);
        }
      }catch(_){}
      return ret;
    }));
  }

  if(GuildMemberStore && typeof GuildMemberStore.getMember==="function"){
    unpatches.push(patcher.after("getMember",GuildMemberStore,function(args,ret){
      if(!ret || !storage.nickColorEnabled) return ret;
      var userId = args && args[1];
      var hex = normalizeHex(storage.nickColor);
      var dec = hexToInt(storage.nickColor);
      if(!hex || dec==null || !myUserId || String(userId)!==String(myUserId)) return ret;

      var copy = cloneObject(ret);
      setValue(copy,"colorString",hex);
      setValue(copy,"color",dec);
      return copy;
    }));
  }
}

function Card(props){
  return React.createElement(RN.View,{
    style:{backgroundColor:"#1f1f23",borderRadius:14,padding:14,marginBottom:14}
  },
    React.createElement(RN.Text,{
      style:{color:"#fff",fontSize:18,fontWeight:"800",marginBottom:6}
    },props.title),
    props.sub ? React.createElement(RN.Text,{
      style:{color:"#aaa",fontSize:13,lineHeight:18,marginBottom:8}
    },props.sub) : null,
    props.children
  );
}

function Button(props){
  return React.createElement(RN.Pressable,{
    onPress:props.onPress,
    style:{
      backgroundColor:props.secondary ? "#36363d" : "#5865f2",
      paddingVertical:12,
      paddingHorizontal:14,
      borderRadius:10,
      marginTop:8
    }
  },
    React.createElement(RN.Text,{
      style:{color:"#fff",fontWeight:"800",textAlign:"center"}
    },props.text)
  );
}

function Toggle(props){
  return React.createElement(RN.Pressable,{
    onPress:props.onPress,
    style:{
      backgroundColor:props.value ? "#2f8b4b" : "#34343a",
      paddingVertical:12,
      paddingHorizontal:14,
      borderRadius:10,
      marginTop:8
    }
  },
    React.createElement(RN.Text,{
      style:{color:"#fff",fontWeight:"800"}
    },props.label+": "+(props.value?"ON":"OFF"))
  );
}

function Preview(props){
  if(!props.uri) return null;
  return React.createElement(RN.Image,{
    source:{uri:props.uri},
    resizeMode:props.banner ? "cover" : "contain",
    style:props.banner
      ? {width:"100%",height:120,borderRadius:10,backgroundColor:"#111",marginTop:10}
      : {width:170,height:170,alignSelf:"center",backgroundColor:"transparent",marginTop:10}
  });
}

function Settings(){
  var st = React.useReducer(function(x){return x+1},0);
  var refresh = st[1];

  async function choose(key,mode){
    try{
      var ok = mode==="photo" ? await pickPhoto(key) : await pickFile(key);
      if(ok){
        refresh();
        toast("Obraz ustawiony.");
      }
    }catch(e){
      logError("picker",e);
      toast(e && e.message ? e.message : "Nie udało się wybrać obrazu.");
    }
  }

  function clearMedia(key){
    storage[key]=null;
    refreshDiscord();
    refresh();
  }

  function setColor(hex){
    storage.nickColor=hex;
    storage.nickColorEnabled=true;
    refreshDiscord();
    refresh();
  }

  var banner = mediaUri("bannerMedia");
  var decoration = mediaUri("decorationMedia");

  return React.createElement(RN.ScrollView,{
    style:{flex:1},
    contentContainerStyle:{padding:16,paddingBottom:60}
  },
    React.createElement(Card,{
      title:"DonMillson Tweaks 0.3",
      sub:"Profil działa lokalnie w Revenge. Banner i dekorację wybierasz bez URL."
    }),

    React.createElement(Card,{
      title:"Banner profilu",
      sub:banner ? mediaName("bannerMedia") : "Nie wybrano bannera"
    },
      React.createElement(Toggle,{
        label:"Banner",
        value:!!storage.bannerEnabled,
        onPress:function(){storage.bannerEnabled=!storage.bannerEnabled;refreshDiscord();refresh()}
      }),
      React.createElement(Button,{text:"Wybierz z Galerii",onPress:function(){choose("bannerMedia","photo")}}),
      React.createElement(Button,{text:"Wybierz z Plików",secondary:true,onPress:function(){choose("bannerMedia","file")}}),
      banner ? React.createElement(Button,{text:"Usuń banner",secondary:true,onPress:function(){clearMedia("bannerMedia")}}) : null,
      React.createElement(Preview,{uri:banner,banner:true})
    ),

    React.createElement(Card,{
      title:"Dekoracja avatara",
      sub:decoration ? mediaName("decorationMedia") : "Najlepiej PNG/APNG/WEBP z przezroczystym tłem"
    },
      React.createElement(Toggle,{
        label:"Dekoracja",
        value:!!storage.decorationEnabled,
        onPress:function(){storage.decorationEnabled=!storage.decorationEnabled;refreshDiscord();refresh()}
      }),
      React.createElement(Button,{text:"Wybierz z Galerii",onPress:function(){choose("decorationMedia","photo")}}),
      React.createElement(Button,{text:"Wybierz z Plików",secondary:true,onPress:function(){choose("decorationMedia","file")}}),
      decoration ? React.createElement(Button,{text:"Usuń dekorację",secondary:true,onPress:function(){clearMedia("decorationMedia")}}) : null,
      React.createElement(Preview,{uri:decoration,banner:false})
    ),

    React.createElement(Card,{
      title:"Kolor nicku",
      sub:"Lokalny kolor nicku w Revenge."
    },
      React.createElement(Toggle,{
        label:"Kolor nicku",
        value:!!storage.nickColorEnabled,
        onPress:function(){storage.nickColorEnabled=!storage.nickColorEnabled;refreshDiscord();refresh()}
      }),
      React.createElement(RN.View,{style:{flexDirection:"row",flexWrap:"wrap",gap:8,marginTop:8}},
        ["#b96cff","#ff4fc3","#4da3ff","#57f287","#ed4245","#ff9f43"].map(function(hex){
          return React.createElement(RN.Pressable,{
            key:hex,
            onPress:function(){setColor(hex)},
            style:{
              width:44,height:44,borderRadius:22,backgroundColor:hex,
              borderWidth:normalizeHex(storage.nickColor)===hex?3:0,borderColor:"#fff"
            }
          });
        })
      ),
      React.createElement(RN.TextInput,{
        value:String(storage.nickColor||""),
        placeholder:"#b96cff",
        placeholderTextColor:"#777",
        autoCapitalize:"none",
        autoCorrect:false,
        onChangeText:function(v){storage.nickColor=v;refresh()},
        style:{
          color:"#fff",backgroundColor:"#2b2b30",borderRadius:10,
          paddingHorizontal:12,paddingVertical:10,marginTop:12
        }
      }),
      React.createElement(Button,{
        text:"Zastosuj kolor HEX",
        onPress:function(){
          var h=normalizeHex(storage.nickColor);
          if(!h){toast("Nieprawidłowy kolor HEX.");return}
          setColor(h);
          toast("Kolor nicku zastosowany.");
        }
      })
    ),

    React.createElement(Card,{
      title:"Tekst pisania",
      sub:"Moduł „nawija / papla / szczeka” dołożę w następnym kroku po potwierdzeniu, że profil działa bez wyłączania pluginu."
    })
  );
}

function onLoad(){
  defaults();
  captureUserId();

  try{patchProfile()}catch(e){logError("profile patch",e)}

  try{refreshDiscord()}catch(_){}
  toast("DonMillson Tweaks 0.3 włączony");
}

function onUnload(){
  while(unpatches.length){
    try{var fn=unpatches.pop(); if(fn) fn()}catch(_){}
  }
  try{refreshDiscord()}catch(_){}
  myUserId=null;
}

exports.onLoad=onLoad;
exports.onUnload=onUnload;
exports.settings=Settings;
return exports;
})({},vendetta);
