"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const crypto = require("node:crypto");
const path = require("node:path");
const dist = path.resolve(__dirname, "../dist");
const GUILD = "100000000000000001", OWNER = "100000000000000002", CONFIG = "100000000000000003", CHAT = "100000000000000004", DM = "100000000000000005", CHAT2 = "100000000000000006";
const message = { id: "100000000000000010", author: { id: OWNER }, content: "", attachments: [{ filename: "wall.png", content_type: "image/png", size: 4096, url: "https://cdn.discordapp.com/attachments/a/b/wall.png" }] };
const tick = () => new Promise(resolve => setImmediate(resolve));
function setup() {
    let selected = CHAT;
    const timers = new Set();
    const subscriptions = new Map();
    const React = {
        Component: class { constructor(props) { this.props = props; } },
        createElement(type, props, ...children) { return { type, props: Object.assign({}, props, children.length ? { children: children.length === 1 ? children[0] : children } : {}) }; },
        cloneElement(element, props) { return { type: element.type, props: Object.assign({}, element.props, props) }; },
        isValidElement(element) { return !!element && !!element.type && !!element.props; },
        useEffect() {}, useState(value) { return [value, () => {}]; }
    };
    const RN = { View: "View", Image: "Image", Text: "Text", ScrollView: "ScrollView", TextInput: "TextInput", TouchableOpacity: "TouchableOpacity", Switch: "Switch",
        AppState: { currentState: "active", addEventListener() { return { remove() {} }; } } };
    const leaf = Object.freeze(React.createElement("Text", { style: Object.freeze({ color: "white" }) }, "message"));
    const native = Object.freeze(React.createElement("View", { HACK_fixModalInteraction: true, style: Object.freeze({ backgroundColor: "black" }) }, leaf));
    const tree = Object.freeze(React.createElement("View", { style: Object.freeze({ flex: 1, backgroundColor: "black" }) }, native));
    const Messages = { render() { return tree; } };
    const original = Messages.render;
    const channel = id => id === DM ? { id, type: 1 } : [CONFIG, CHAT, CHAT2].includes(id) ? { id, guild_id: GUILD, type: 0, name: id === CONFIG ? "tlo-serwera" : "chat" } : null;
    const storage = {};
    const stores = {
        SelectedChannelStore: { getChannelId: () => selected },
        ChannelStore: { getChannel: channel, getMutableGuildChannelsForGuild: () => ({ [CONFIG]: channel(CONFIG), [CHAT]: channel(CHAT) }) },
        GuildStore: { getGuild: () => ({ ownerId: OWNER }) },
        MessageStore: { getMessages: () => ({ toArray: () => [] }) },
        UserStore: { getCurrentUser: () => ({ id: OWNER }) }
    };
    const http = { get: async () => ({ status: 200, body: [message] }) };
    const api = { plugin: { storage }, metro: {
        common: { React, ReactNative: RN, FluxDispatcher: {
            subscribe(name, callback) { subscriptions.set(name, callback); },
            unsubscribe(name, callback) { if (subscriptions.get(name) === callback) subscriptions.delete(name); }
        } },
        findByStoreName: name => stores[name], findByProps: () => http,
        findByDisplayName: name => name === "MessagesConnected" ? Messages : undefined
    }, patcher: { after(name, target, callback) {
        const fn = target[name];
        target[name] = function (...args) { const ret = fn.apply(this, args); const patched = callback(args, ret); return patched === undefined ? ret : patched; };
        return () => { target[name] = fn; };
    } } };
    // The app's localization getter is known to throw on some builds. Never touch it.
    Object.defineProperty(api.metro.common, "i18n", { get() { throw new Error("broken localization getter"); } });
    const environment = { vendetta: api, console, setTimeout(fn, ms) { const timer = { fn, ms }; timers.add(timer); return timer; },
        clearTimeout(timer) { timers.delete(timer); }, setInterval(fn) { const timer = { fn }; timers.add(timer); return timer; }, clearInterval(timer) { timers.delete(timer); } };
    const bundle = fs.readFileSync(path.join(dist, "index.js"), "utf8");
    const plugin = vm.runInNewContext("(vendetta => {return " + bundle + "})(vendetta)", environment);
    return { plugin, api, storage, stores, http, channel, Messages, original, tree, native, leaf, timers, subscriptions, select: id => selected = id,
        rendered(id) { const boundary = Messages.render({ channelId: id }); const background = boundary.props.children; return background.type(background.props); } };
}
test("bundle follows the real Revenge expression loader and its hash matches the served bytes", () => {
    const bytes = fs.readFileSync(path.join(dist, "index.js"));
    const manifest = JSON.parse(fs.readFileSync(path.join(dist, "manifest.json")));
    assert.equal(manifest.hash, crypto.createHash("sha256").update(bytes).digest("hex"));
    assert.equal(manifest.main, "index.js");
    const s = setup();
    assert.equal(typeof s.plugin.onLoad, "function");
    assert.equal(typeof s.plugin.onUnload, "function");
    assert.equal(typeof s.plugin.settings, "function");
});
test("chat gets an image layer while immutable Discord elements retain their original styles", async () => {
    const s = setup();
    s.plugin.onLoad();
    await tick();
    const view = s.rendered(CHAT);
    assert.equal(view.type, "View");
    assert.equal(view.props.children[0].type, "Image");
    const copy = view.props.children[2].props.children;
    assert.notEqual(copy, s.tree);
    assert.equal(copy.props.style[1].backgroundColor, "transparent");
    assert.equal(copy.props.children.props.style[1].backgroundColor, "transparent");
    assert.equal(s.tree.props.style.backgroundColor, "black");
    assert.equal(s.native.props.style.backgroundColor, "black");
    assert.equal(copy.props.children.props.children, s.leaf);
    s.plugin.onUnload();
});
test("an explicit DM never inherits the selected server's background", async () => {
    const s = setup();
    s.plugin.onLoad();
    await tick();
    assert.equal(s.rendered(DM), s.tree);
    s.select(DM);
    assert.equal(s.rendered(DM), s.tree);
    s.plugin.onUnload();
});
test("the same server wallpaper appears on a second channel", async () => {
    const s = setup();
    s.plugin.onLoad();
    await tick();
    const first = s.rendered(CHAT).props.children[0].props.source.uri;
    s.select(CHAT2);
    const second = s.rendered(CHAT2).props.children[0].props.source.uri;
    assert.equal(first, second);
    s.plugin.onUnload();
});
test("an empty primary channel list falls back to a nested Map of loaded channels", async () => {
    const s = setup();
    s.stores.ChannelStore.getMutableGuildChannelsForGuild = () => ({});
    s.stores.ChannelStore.getChannels = () => new Map([[GUILD, new Map([[CONFIG, s.channel(CONFIG)], [CHAT, s.channel(CHAT)]])]]);
    s.plugin.onLoad();
    await tick();
    assert.equal(s.rendered(CHAT).props.children[0].props.source.uri, message.attachments[0].url);
    s.plugin.onUnload();
});
test("lazily loaded HTTP modules recover without a restart", async () => {
    const s = setup();
    s.api.metro.findByProps = () => undefined;
    s.plugin.onLoad();
    assert.equal(s.Messages.render, s.original);
    const retry = Array.from(s.timers).find(timer => timer.ms === 3000);
    assert.ok(retry);
    s.api.metro.findByProps = () => s.http;
    s.timers.delete(retry);
    retry.fn();
    await tick();
    assert.equal(s.rendered(CHAT).props.children[0].props.source.uri, message.attachments[0].url);
    s.plugin.onUnload();
    assert.equal(s.timers.size, 0);
});
test("diagnostics retains the server in settings and reports native image loading without copying URLs or secrets", async () => {
    const s = setup();
    let copied;
    s.api.debug = { getDebugInfo: () => ({ discord: { version: "test-version", build: "123" }, bunny: { version: "test-classic" }, token: "must-not-copy" }) };
    s.api.metro.common.clipboard = { setString: value => { copied = value; } };
    s.plugin.onLoad();
    await tick();
    s.rendered(CHAT).props.children[0].props.onLoad();
    s.select(null);
    const view = s.plugin.settings();
    const copy = view.props.children.find(child => child?.props?.children?.props?.children === "Kopiuj diagnostykę");
    assert.ok(copy);
    copy.props.onPress();
    await tick();
    assert.match(copied, /By DonMillson/);
    assert.match(copied, /Discord: test-version/);
    assert.match(copied, /Właściciel serwera: tak/);
    assert.match(copied, /Obraz wczytany: wall.png/);
    assert.match(copied, /Kontener listy wiadomości: wykryty/);
    assert.equal(copied.includes("https://"), false);
    assert.equal(copied.includes("must-not-copy"), false);
    s.plugin.onUnload();
});
test("a stopped plugin can start again without retaining its old controller", async () => {
    const s = setup();
    s.plugin.onLoad();
    await tick();
    s.plugin.onUnload();
    s.plugin.onLoad();
    await tick();
    assert.equal(s.rendered(CHAT).props.children[0].props.source.uri, message.attachments[0].url);
    s.plugin.onUnload();
    assert.equal(s.timers.size, 0);
    assert.equal(s.subscriptions.size, 0);
});
test("an image failure restores the original messages and unloading restores patches and listeners", async () => {
    const s = setup();
    s.plugin.onLoad();
    await tick();
    s.rendered(CHAT).props.children[0].props.onError();
    assert.equal(s.rendered(CHAT), s.tree);
    s.plugin.onUnload();
    assert.equal(s.Messages.render, s.original);
    assert.equal(s.timers.size, 0);
    assert.equal(s.subscriptions.size, 0);
});
test("missing or moved modules fail gracefully without throwing on startup", () => {
    const s = setup();
    s.api.metro.findByProps = () => { throw new Error("module moved"); };
    assert.doesNotThrow(() => s.plugin.onLoad());
    assert.doesNotThrow(() => s.plugin.settings());
    assert.doesNotThrow(() => s.plugin.onUnload());
    assert.equal(s.Messages.render, s.original);
});
