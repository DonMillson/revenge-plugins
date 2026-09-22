(function(exports,vendetta){
"use strict";

function getStorage(){
  try{return vendetta&&vendetta.plugin&&vendetta.plugin.storage||{}}catch(_){return {}}
}

function safeToast(msg){
  try{
    var t=vendetta&&vendetta.ui&&vendetta.ui.toasts;
    if(t&&typeof t.showToast==="function") t.showToast(String(msg));
  }catch(_){}
}

function onLoad(){
  try{
    var storage=getStorage();
    if(storage){
      if(storage.typingEnabled==null) storage.typingEnabled=true;
      if(storage.typingStyle==null) storage.typingStyle="custom";
      if(storage.customTypingText==null) storage.customTypingText="nawija";
      if(storage.customTypingPlural==null) storage.customTypingPlural="nawijają";
      if(storage.nickColorEnabled==null) storage.nickColorEnabled=false;
      if(storage.nickColor==null) storage.nickColor="#b96cff";
      if(storage.bannerEnabled==null) storage.bannerEnabled=false;
      if(storage.decorationEnabled==null) storage.decorationEnabled=false;
    }
  }catch(_){}
  safeToast("DonMillson Tweaks 0.2.2 uruchomiony");
}

function onUnload(){}

function Settings(){
  try{
    var common=vendetta.metro.common;
    var React=common.React;
    var RN=common.ReactNative;
    var storage=getStorage();

    var state=React.useReducer(function(x){return x+1},0);
    var refresh=state[1];

    function Box(props){
      return React.createElement(RN.View,{
        style:{
          backgroundColor:"#1f1f23",
          borderRadius:12,
          padding:14,
          marginBottom:12
        }
      },
        React.createElement(RN.Text,{
          style:{color:"#fff",fontSize:16,fontWeight:"700",marginBottom:6}
        },props.title),
        props.sub?React.createElement(RN.Text,{
          style:{color:"#aaa",fontSize:13,lineHeight:18}
        },props.sub):null,
        props.children
      );
    }

    function Toggle(props){
      return React.createElement(RN.Pressable,{
        onPress:function(){
          storage[props.keyName]=!storage[props.keyName];
          refresh();
        },
        style:{
          backgroundColor:storage[props.keyName]?"#2f7d46":"#34343a",
          padding:12,
          borderRadius:9,
          marginTop:10
        }
      },
        React.createElement(RN.Text,{
          style:{color:"#fff",fontWeight:"700"}
        },props.label+": "+(storage[props.keyName]?"ON":"OFF"))
      );
    }

    return React.createElement(RN.ScrollView,{
      style:{flex:1},
      contentContainerStyle:{padding:16,paddingBottom:40}
    },
      React.createElement(Box,{
        title:"DonMillson Tweaks 0.2.2",
        sub:"Tryb diagnostyczny. Jeżeli widzisz ten ekran i plugin pozostaje włączony, sam szkielet działa poprawnie."
      }),
      React.createElement(Box,{
        title:"Tekst pisania",
        sub:"Docelowo: nawija / papla / szczeka / własny tekst."
      },
        React.createElement(Toggle,{label:"Własny tekst",keyName:"typingEnabled"})
      ),
      React.createElement(Box,{
        title:"Kolor nicku",
        sub:"Docelowo: presety i własny HEX."
      },
        React.createElement(Toggle,{label:"Kolor nicku",keyName:"nickColorEnabled"})
      ),
      React.createElement(Box,{
        title:"Banner z pliku",
        sub:"Docelowo: wybór z Galerii lub Plików bez URL."
      },
        React.createElement(Toggle,{label:"Banner",keyName:"bannerEnabled"})
      ),
      React.createElement(Box,{
        title:"Dekoracja z pliku",
        sub:"Docelowo: PNG/APNG/WEBP z telefonu."
      },
        React.createElement(Toggle,{label:"Dekoracja",keyName:"decorationEnabled"})
      )
    );
  }catch(e){
    try{
      var R=vendetta.metro.common.React;
      var N=vendetta.metro.common.ReactNative;
      return R.createElement(N.View,{style:{padding:20}},
        R.createElement(N.Text,{style:{color:"#fff"}},"Błąd ekranu ustawień: "+String(e))
      );
    }catch(_){
      return null;
    }
  }
}

exports.onLoad=onLoad;
exports.onUnload=onUnload;
exports.settings=Settings;
return exports;
})({},vendetta);
