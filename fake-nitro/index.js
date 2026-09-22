const { findByProps, findByStoreName } = vendetta.metro;
const { instead, before } = vendetta.patcher;
const { storage } = vendetta.plugin;

storage.emojiSize ??= 48;
storage.forceEmoji ??= false;

const unpatches = [];
const nitroInfo = findByProps("canUseEmojisEverywhere");
if (nitroInfo) {
  if (nitroInfo.canUseEmojisEverywhere) unpatches.push(instead("canUseEmojisEverywhere", nitroInfo, () => true));
  if (nitroInfo.canUseAnimatedEmojis) unpatches.push(instead("canUseAnimatedEmojis", nitroInfo, () => true));
}

const EmojiStore = findByStoreName("EmojiStore");
const SelectedGuildStore = findByStoreName("SelectedGuildStore");
const UserStore = findByStoreName("UserStore");

function modifyIfNeeded(msg) {
  if (!msg || typeof msg.content !== "string") return;
  if (!/<a?:\w+:\d+>/i.test(msg.content)) return;

  const premiumType = UserStore?.getCurrentUser?.()?.premiumType;
  if (!storage.forceEmoji && premiumType != null && premiumType !== 0) return;

  const currentGuild = SelectedGuildStore?.getGuildId?.();
  msg.content = msg.content.replace(/<a?:(\w+):(\d+)>/gi, (full, name, id) => {
    const emoji = EmojiStore?.getCustomEmojiById?.(id);
    if (!emoji) return full;
    const usableHere = emoji.guildId === currentGuild && !emoji.animated;
    if (usableHere && !storage.forceEmoji) return full;
    const animated = emoji.animated ? "&animated=true" : "";
    return `[${name}](https://cdn.discordapp.com/emojis/${id}.webp?size=${storage.emojiSize}&quality=lossless&name=${encodeURIComponent(name)}${animated})`;
  });
  msg.invalidEmojis = [];
}

const messageModule = findByProps("sendMessage", "receiveMessage");
if (messageModule?.sendMessage) unpatches.push(before("sendMessage", messageModule, args => modifyIfNeeded(args[1])));

const uploadModule = findByProps("uploadLocalFiles");
if (uploadModule?.uploadLocalFiles) unpatches.push(before("uploadLocalFiles", uploadModule, args => modifyIfNeeded(args[0]?.parsedMessage)));

export const onUnload = () => unpatches.forEach(fn => { try { fn(); } catch {} });
