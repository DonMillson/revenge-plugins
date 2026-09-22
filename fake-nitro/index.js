(function(exports, metro, common, api, plugin) {
"use strict";

const storage = plugin.storage;
storage.emojiSize ??= 48;
storage.forceEmoji ??= false;

let unpatches = [];

function safeFindByProps(...props) {
  try { return metro.findByProps?.(...props) || metro.findByPropsLazy?.(...props); }
  catch { return null; }
}

function safeStore(name) {
  try { return metro.findByStoreName?.(name) || metro.findByStoreNameLazy?.(name); }
  catch { return null; }
}

function modifyIfNeeded(msg) {
  try {
    if (!msg || typeof msg.content !== "string") return;
    if (!/<a?:\\w+:\\d+>/i.test(msg.content)) return;

    const EmojiStore = safeStore("EmojiStore");
    const SelectedGuildStore = safeStore("SelectedGuildStore");
    const UserStore = safeStore("UserStore");

    const premiumType = UserStore?.getCurrentUser?.()?.premiumType;
    if (!storage.forceEmoji && premiumType != null && premiumType !== 0) return;

    const currentGuild = SelectedGuildStore?.getGuildId?.();

    msg.content = msg.content.replace(/<a?:(\\w+):(\\d+)>/gi, (full, name, id) => {
      const emoji = EmojiStore?.getCustomEmojiById?.(id);
      if (!emoji) return full;

      const usableHere = emoji.guildId === currentGuild && !emoji.animated;
      if (usableHere && !storage.forceEmoji) return full;

      const animated = emoji.animated ? "&animated=true" : "";
      return `[${name}](https://cdn.discordapp.com/emojis/${id}.webp?size=${Number(storage.emojiSize) || 48}&quality=lossless&name=${encodeURIComponent(name)}${animated})`;
    });

    msg.invalidEmojis = [];
  } catch {}
}

function onLoad() {
  const patcher = api.patcher || api;
  const before = patcher?.before;
  const instead = patcher?.instead;

  try {
    const nitroInfo = safeFindByProps("canUseEmojisEverywhere");
    if (nitroInfo && typeof instead === "function") {
      if (typeof nitroInfo.canUseEmojisEverywhere === "function")
        unpatches.push(instead("canUseEmojisEverywhere", nitroInfo, () => true));
      if (typeof nitroInfo.canUseAnimatedEmojis === "function")
        unpatches.push(instead("canUseAnimatedEmojis", nitroInfo, () => true));
    }
  } catch {}

  try {
    const messageModule = safeFindByProps("sendMessage", "receiveMessage");
    if (messageModule?.sendMessage && typeof before === "function")
      unpatches.push(before("sendMessage", messageModule, args => modifyIfNeeded(args?.[1])));
  } catch {}

  try {
    const uploadModule = safeFindByProps("uploadLocalFiles");
    if (uploadModule?.uploadLocalFiles && typeof before === "function")
      unpatches.push(before("uploadLocalFiles", uploadModule, args => modifyIfNeeded(args?.[0]?.parsedMessage)));
  } catch {}
}

function onUnload() {
  for (const unpatch of unpatches) {
    try { unpatch?.(); } catch {}
  }
  unpatches = [];
}

const index = { onLoad, onUnload };
exports.default = index;
Object.defineProperty(exports, "__esModule", { value: true });
return exports;
})(
  {},
  typeof bunny !== "undefined" && bunny.metro ? bunny.metro : vendetta.metro,
  typeof bunny !== "undefined" && bunny.metro?.common ? bunny.metro.common : vendetta.metro.common,
  typeof bunny !== "undefined" && bunny.api?.patcher ? bunny.api : vendetta,
  vendetta.plugin
);