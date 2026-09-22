(function(exports, metro, common, api, plugin) {
"use strict";
const storage = plugin.storage;
storage.emojiSize ??= 48;
let unpatches = [];
function fp(){try{return metro.findByProps?.apply(null,arguments)||metro.findByPropsLazy?.apply(null,arguments)}catch{return null}}
function fs(n){try{return metro.findByStoreName?.(n)||metro.findByStoreNameLazy?.(n)}catch{return null}}
function patchBool(obj,key){try{if(obj&&typeof obj[key]==="function")unpatches.push((api.patcher||api).instead(key,obj,()=>true))}catch{}}
function modify(msg){
 try{
  if(!msg||typeof msg.content!=="string"||!/<a?:\\w+:\\d+>/i.test(msg.content))return;
  const es=fs("EmojiStore"), gs=fs("SelectedGuildStore"), us=fs("UserStore");
  const pt=us?.getCurrentUser?.()?.premiumType;
  if(pt!=null&&pt!==0)return;
  const gid=gs?.getGuildId?.();
  msg.content=msg.content.replace(/<a?:(\\w+):(\\d+)>/gi,(full,name,id)=>{
   const e=es?.getCustomEmojiById?.(id); if(!e)return full;
   if(e.guildId===gid&&!e.animated)return full;
   return "["+name+"](https://cdn.discordapp.com/emojis/"+id+".webp?size="+(Number(storage.emojiSize)||48)+"&quality=lossless&name="+encodeURIComponent(name)+(e.animated?"&animated=true":"")+")";
  }); msg.invalidEmojis=[];
 }catch{}
}
function sweep(){
 const names=[
  "canUseEmojisEverywhere","canUseAnimatedEmojis",
  "canUseAvatarDecorations","canUseAvatarDecoration","canUseCollectibles",
  "canUseCollectiblesShop","canUseProfileEffects","canUsePremiumProfileCustomization"
 ];
 for(const n of names){const o=fp(n);patchBool(o,n)}
 // Discord changes these names often; patch only discovered boolean entitlement/capability functions.
 try{
  const reg=metro.modules;
  if(reg&&typeof reg==="object"){
   for(const k in reg){
    let ex; try{ex=reg[k]?.publicModule?.exports||reg[k]?.exports}catch{continue}
    const candidates=[ex,ex?.default];
    for(const o of candidates){
     if(!o||typeof o!=="object")continue;
     for(const key of Object.keys(o)){
      if(typeof o[key]!=="function")continue;
      if(/^(can|is).*(avatar.?decoration|collectible|profile.?effect)/i.test(key)&&!/(purchase|owned|ownership|entitled|sku|payment)/i.test(key))patchBool(o,key);
     }
    }
   }
  }
 }catch{}
}
function onLoad(){
 sweep();
 try{const mm=fp("sendMessage","receiveMessage");if(mm?.sendMessage)unpatches.push((api.patcher||api).before("sendMessage",mm,a=>modify(a?.[1])))}catch{}
 try{const um=fp("uploadLocalFiles");if(um?.uploadLocalFiles)unpatches.push((api.patcher||api).before("uploadLocalFiles",um,a=>modify(a?.[0]?.parsedMessage)))}catch{}
}
function onUnload(){for(const u of unpatches)try{u?.()}catch{} unpatches=[]}
exports.default={onLoad,onUnload};
Object.defineProperty(exports,"__esModule",{value:true});return exports;
})({},typeof bunny!=="undefined"&&bunny.metro?bunny.metro:vendetta.metro,typeof bunny!=="undefined"&&bunny.metro?.common?bunny.metro.common:vendetta.metro.common,typeof bunny!=="undefined"&&bunny.api?.patcher?bunny.api:vendetta,vendetta.plugin);