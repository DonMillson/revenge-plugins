(function(exports, metro, common, api, plugin) {
"use strict";

const React = common.React;
const RN = common.ReactNative;
const storage = plugin.storage;

storage.enabled ??= true;
storage.bannerEnabled ??= false;
storage.bannerMedia ??= null;
storage.nickColorEnabled ??= false;
storage.nickColor ??= "#b96cff";
storage.decorationEnabled ??= false;
storage.decorationMedia ??= null;

let unpatches = [];
let myId = null;
let userCache = new WeakMap();
let profileCache = new WeakMap();

function clearCache() {
  userCache = new WeakMap();
  profileCache = new WeakMap();
}

function safeStore(name) {
  try { return metro.findByStoreName?.(name) || metro.findByStoreNameLazy?.(name); }
  catch { return null; }
}

function toast(message) {
  try { api.ui?.toasts?.showToast?.(String(message)); }
  catch {
    try { vendetta.ui.toasts.showToast(String(message)); } catch {}
  }
}

function mediaUri(key) {
  return String(storage[key]?.uri || "");
}

function mediaName(key) {
  return String(storage[key]?.name || "Wybrany obraz");
}

function saveMedia(key, asset) {
  const uri = asset?.fileCopyUri || asset?.uri;
  const name = String(asset?.fileName || asset?.name || "Wybrany obraz");
  const type = String(asset?.type || "").toLowerCase();

  if (!uri) throw new Error("Nie wybrano obrazu.");
  if (type && !type.startsWith("image/")) throw new Error("Wybierz obraz lub GIF.");

  storage[key] = { uri, name, type };
  clearCache();
  refreshDiscord();
}

async function pickFile(key) {
  let picker;
  try { picker = metro.findByProps?.("pickSingle", "isCancel"); } catch {}
  if (!picker?.pickSingle) throw new Error("Systemowy wybór plików jest niedostępny.");

  try {
    const asset = await picker.pickSingle({
      type: picker.types?.images || "image/*",
      mode: "import",
      copyTo: "documentDirectory"
    });
    if (!asset) return false;
    saveMedia(key, asset);
    return true;
  } catch (error) {
    if (picker.isCancel?.(error)) return false;
    throw error;
  }
}

async function pickPhoto(key) {
  let picker;
  try { picker = metro.findByProps?.("launchImageLibrary"); } catch {}
  if (!picker?.launchImageLibrary) return pickFile(key);

  const result = await new Promise((resolve, reject) => {
    let returned;
    try {
      returned = picker.launchImageLibrary({
        mediaType: "photo",
        selectionLimit: 1,
        includeBase64: false,
        assetRepresentationMode: "current"
      }, resolve);
    } catch (error) {
      reject(error);
      return;
    }
    if (returned?.then) returned.then(resolve, reject);
  });

  if (result?.didCancel) return false;
  if (result?.errorCode) throw new Error(result.errorMessage || "Nie udało się otworzyć galerii.");

  const asset = result?.assets?.[0];
  if (!asset) return false;
  saveMedia(key, asset);
  return true;
}

function normalizeHex(value) {
  let s = String(value || "").trim();
  if (!s) return null;
  if (!s.startsWith("#")) s = "#" + s;
  if (/^#[0-9a-f]{3}$/i.test(s)) {
    s = "#" + s[1] + s[1] + s[2] + s[2] + s[3] + s[3];
  }
  return /^#[0-9a-f]{6}$/i.test(s) ? s.toLowerCase() : null;
}

function cloneWithDescriptors(original) {
  try {
    const clone = Object.create(Object.getPrototypeOf(original));
    for (const key of Reflect.ownKeys(original)) {
      try {
        const desc = Object.getOwnPropertyDescriptor(original, key);
        if (desc) Object.defineProperty(clone, key, desc);
      } catch {}
    }
    return clone;
  } catch {
    try { return { ...original }; }
    catch { return original; }
  }
}

function setOwnValue(obj, key, value) {
  try {
    const oldDesc = Object.getOwnPropertyDescriptor(obj, key);
    const enumerable = oldDesc ? !!oldDesc.enumerable : true;

    if (!oldDesc || oldDesc.configurable) {
      Object.defineProperty(obj, key, {
        value,
        writable: true,
        enumerable,
        configurable: true
      });
      return;
    }

    if (oldDesc.writable) obj[key] = value;
  } catch {
    try { obj[key] = value; } catch {}
  }
}

function applyProfileChanges(obj, original) {
  if (!obj || !storage.enabled) return obj;

  const banner = mediaUri("bannerMedia");
  if (storage.bannerEnabled && banner) {
    setOwnValue(obj, "banner", banner);
    setOwnValue(obj, "bannerURL", banner);
    setOwnValue(obj, "bannerUrl", banner);
    setOwnValue(obj, "getBannerURL", () => banner);
  }

  return obj;
}

function cloneObject(original, type) {
  if (!original || !storage.enabled) return original;

  const cache = type === "profile" ? profileCache : userCache;
  try {
    const cached = cache.get(original);
    if (cached) return cached;
  } catch {}

  const fake = applyProfileChanges(cloneWithDescriptors(original), original);

  try { cache.set(original, fake); } catch {}
  return fake;
}

function cloneUser(user) {
  if (!user || !storage.enabled) return user;
  try {
    if (myId && String(user.id) !== String(myId)) return user;
  } catch {}
  return cloneObject(user, "user");
}

function cloneProfile(profile, userId) {
  if (!profile || !storage.enabled) return profile;
  try {
    if (myId && userId && String(userId) !== String(myId)) return profile;
  } catch {}
  return cloneObject(profile, "profile");
}

function patchStores() {
  const UserStore = safeStore("UserStore") || metro.findByProps?.("getCurrentUser", "getUser");

  if (UserStore) {
    try { myId = UserStore.getCurrentUser?.()?.id || myId; } catch {}

    try {
      if (UserStore.getCurrentUser) {
        unpatches.push(api.patcher.instead("getCurrentUser", UserStore, (args, original) => {
          const user = original(...args);
          try { myId = user?.id || myId; } catch {}
          return cloneUser(user);
        }));
      }
    } catch {}

    try {
      if (UserStore.getUser) {
        unpatches.push(api.patcher.instead("getUser", UserStore, (args, original) => {
          const wantedId = args?.[0];
          if (wantedId && myId && String(wantedId) !== String(myId)) return original(...args);
          if (wantedId && !myId) return original(...args);
          return cloneUser(original(...args));
        }));
      }
    } catch {}
  }

  const ProfileStore = safeStore("UserProfileStore") || metro.findByProps?.("getUserProfile", "getGuildMemberProfile");

  if (ProfileStore) {
    try {
      if (ProfileStore.getUserProfile) {
        unpatches.push(api.patcher.instead("getUserProfile", ProfileStore, (args, original) => {
          const userId = args?.[0];
          if (userId && myId && String(userId) !== String(myId)) return original(...args);
          if (userId && !myId) return original(...args);
          return cloneProfile(original(...args), userId);
        }));
      }
    } catch {}

    try {
      if (ProfileStore.getGuildMemberProfile) {
        unpatches.push(api.patcher.instead("getGuildMemberProfile", ProfileStore, (args, original) => {
          const userId = args?.[0];
          if (userId && myId && String(userId) !== String(myId)) return original(...args);
          if (userId && !myId) return original(...args);
          return cloneProfile(original(...args), userId);
        }));
      }
    } catch {}
  }

  const GuildMemberStore = safeStore("GuildMemberStore");
  if (GuildMemberStore) {
    try {
      if (GuildMemberStore.getMember) {
        unpatches.push(api.patcher.after("getMember", GuildMemberStore, (args, member) => {
          if (!member || !storage.nickColorEnabled) return member;
          const userId = args?.[1];
          if (!myId || String(userId) !== String(myId)) return member;

          const hex = normalizeHex(storage.nickColor);
          if (!hex) return member;

          const fake = cloneWithDescriptors(member);
          setOwnValue(fake, "colorString", hex);
          setOwnValue(fake, "color", parseInt(hex.slice(1), 16));
          return fake;
        }));
      }
    } catch {}
  }
}

function refreshDiscord() {
  clearCache();

  try { (safeStore("UserStore") || metro.findByProps?.("getCurrentUser", "getUser"))?.emitChange?.(); } catch {}
  try { (safeStore("UserProfileStore") || metro.findByProps?.("getUserProfile", "getGuildMemberProfile"))?.emitChange?.(); } catch {}
  try { safeStore("GuildMemberStore")?.emitChange?.(); } catch {}

  try {
    const Dispatcher = metro.findByProps?.("dispatch", "subscribe");
    Dispatcher?.dispatch?.({ type: "CURRENT_USER_UPDATE" });
    if (myId) Dispatcher?.dispatch?.({ type: "USER_PROFILE_UPDATE", userId: myId });
  } catch {}
}

function Settings() {
  const [, forceUpdate] = React.useReducer(x => x + 1, 0);

  const Toggle = ({ label, sub, value, onPress }) => React.createElement(RN.Pressable, {
    onPress,
    style: {
      backgroundColor: value ? "#2f7d46" : "#2b2b2b",
      padding: 12,
      borderRadius: 10,
      marginBottom: 8
    }
  },
    React.createElement(RN.Text, { style: { color: "#fff", fontSize: 15, fontWeight: "800" } }, value ? label + ": ON" : label + ": OFF"),
    sub ? React.createElement(RN.Text, { style: { color: "#aaa", marginTop: 3, fontSize: 12 } }, sub) : null
  );

  const Button = ({ text, onPress, secondary }) => React.createElement(RN.Pressable, {
    onPress,
    style: {
      backgroundColor: secondary ? "#35373c" : "#5865f2",
      padding: 11,
      borderRadius: 8,
      marginBottom: 8
    }
  }, React.createElement(RN.Text, {
    style: { color: "#fff", textAlign: "center", fontWeight: "800" }
  }, text));

  const Section = ({ title, children }) => React.createElement(RN.View, {
    style: { backgroundColor: "#1f1f23", padding: 14, borderRadius: 12, marginBottom: 14 }
  },
    React.createElement(RN.Text, { style: { color: "#fff", fontSize: 18, fontWeight: "900", marginBottom: 10 } }, title),
    children
  );

  async function choose(key, picker) {
    try {
      if (await picker(key)) forceUpdate();
    } catch (error) {
      try { RN.Alert.alert("DonMillson Tweaks", error?.message || "Nie udało się wybrać obrazu."); }
      catch { toast(error?.message || "Nie udało się wybrać obrazu."); }
    }
  }

  const banner = mediaUri("bannerMedia");
  const decoration = mediaUri("decorationMedia");

  return React.createElement(RN.ScrollView, {
    style: { flex: 1 },
    contentContainerStyle: { padding: 16, paddingBottom: 50 }
  },

    React.createElement(Section, { title: "DonMillson FakeNitro v7 SAFE" },
      React.createElement(RN.Text, { style: { color: "#aaa", lineHeight: 18 } },
        "Wersja stabilna: banner i kolor nicku. Usunięto globalne patche Nitro powodujące crash avatara. Dekoracje będą dodawane wyłącznie przez bezpieczny renderer kompatybilny z pluginami FakeProfile."
      )
    ),

    React.createElement(Section, { title: "Banner profilu" },
      React.createElement(Toggle, {
        label: "Banner",
        value: !!storage.bannerEnabled,
        onPress: () => {
          storage.bannerEnabled = !storage.bannerEnabled;
          clearCache();
          refreshDiscord();
          forceUpdate();
        }
      }),
      React.createElement(Button, { text: "Wybierz z Galerii", onPress: () => choose("bannerMedia", pickPhoto) }),
      React.createElement(Button, { text: "Wybierz z Plików", secondary: true, onPress: () => choose("bannerMedia", pickFile) }),
      banner ? React.createElement(Button, {
        text: "Usuń banner",
        secondary: true,
        onPress: () => {
          storage.bannerMedia = null;
          clearCache();
          refreshDiscord();
          forceUpdate();
        }
      }) : null,
      banner ? React.createElement(RN.Image, {
        source: { uri: banner },
        resizeMode: "cover",
        style: { width: "100%", height: 120, borderRadius: 10, backgroundColor: "#111", marginTop: 8 }
      }) : null
    ),

    React.createElement(Section, { title: "Kolor nicku" },
      React.createElement(Toggle, {
        label: "Kolor nicku",
        value: !!storage.nickColorEnabled,
        onPress: () => {
          storage.nickColorEnabled = !storage.nickColorEnabled;
          refreshDiscord();
          forceUpdate();
        }
      }),
      React.createElement(RN.View, { style: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginVertical: 8 } },
        ["#b96cff","#ff4fc3","#4da3ff","#57f287","#ed4245","#ff9f43"].map(hex =>
          React.createElement(RN.Pressable, {
            key: hex,
            onPress: () => {
              storage.nickColor = hex;
              storage.nickColorEnabled = true;
              refreshDiscord();
              forceUpdate();
            },
            style: {
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: hex,
              borderWidth: normalizeHex(storage.nickColor) === hex ? 3 : 0,
              borderColor: "#fff"
            }
          })
        )
      ),
      React.createElement(RN.TextInput, {
        value: String(storage.nickColor || ""),
        placeholder: "#b96cff",
        placeholderTextColor: "#777",
        autoCapitalize: "none",
        autoCorrect: false,
        onChangeText: text => {
          storage.nickColor = text;
          forceUpdate();
        },
        style: {
          color: "#fff",
          backgroundColor: "#2b2b30",
          padding: 11,
          borderRadius: 9
        }
      }),
      React.createElement(Button, {
        text: "Zastosuj HEX",
        onPress: () => {
          const hex = normalizeHex(storage.nickColor);
          if (!hex) return toast("Nieprawidłowy kolor HEX.");
          storage.nickColor = hex;
          storage.nickColorEnabled = true;
          refreshDiscord();
          forceUpdate();
          toast("Kolor zastosowany.");
        }
      })
    ),

    React.createElement(Section, { title: "Dekoracja avatara" },
      React.createElement(Toggle, {
        label: "Dekoracja",
        value: !!storage.decorationEnabled,
        onPress: () => {
          storage.decorationEnabled = !storage.decorationEnabled;
          forceUpdate();
        }
      }),
      React.createElement(Button, { text: "Wybierz dekorację z Galerii", onPress: () => choose("decorationMedia", pickPhoto) }),
      React.createElement(Button, { text: "Wybierz dekorację z Plików", secondary: true, onPress: () => choose("decorationMedia", pickFile) }),
      decoration ? React.createElement(RN.Image, {
        source: { uri: decoration },
        resizeMode: "contain",
        style: { width: 170, height: 170, alignSelf: "center", marginTop: 8 }
      }) : null,
      React.createElement(RN.Text, { style: { color: "#f0b232", marginTop: 8, lineHeight: 18 } },
        "Tryb SAFE: dekoracja z pliku pozostaje wyłączona do czasu podpięcia bezpiecznego renderera. Plugin nie modyfikuje globalnych uprawnień Nitro."
      )
    )
  );
}

const index = {
  onLoad() {
    try { patchStores(); }
    catch (e) {
      try { api.logger?.error?.("DonMillson Tweaks patchStores", e); } catch {}
    }
  },
  onUnload() {
    for (const unpatch of unpatches) try { unpatch?.(); } catch {}
    unpatches = [];
    clearCache();
    refreshDiscord();
  },
  settings: Settings
};

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
