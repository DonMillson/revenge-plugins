"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { parseThemeMessage, latestTheme, safeImageUrl, compareIds, findThemeChannel, createController } = require("../src/core.js");
const defaults = require("../config.json");
const GUILD = "100000000000000001";
const OWNER = "100000000000000002";
const CHANNEL = "100000000000000003";
const OTHER = "100000000000000004";
const IMAGE = "https://cdn.discordapp.com/attachments/100000000000000003/100000000000000005/wall.png?ex=ffff&is=aaaa&hm=signature";
function message(id = "100000000000000010", extra = {}) {
    return Object.assign({ id, content: "", author: { id: OWNER }, channel_id: CHANNEL,
        attachments: [{ filename: "wall.png", content_type: "image/png", url: IMAGE, size: 4096, width: 1080, height: 1920 }] }, extra);
}
function setup() {
    let time = 1000000;
    let owner = OWNER;
    let name = "tlo-serwera";
    let response = [message()];
    let read = null;
    let calls = 0;
    const settings = {};
    const channel = () => ({ id: CHANNEL, guild_id: GUILD, type: 0, name });
    const controller = createController({ now: () => time, changed() {},
        getGuild: id => id === GUILD ? { ownerId: owner } : null,
        getChannel: id => id === CHANNEL ? channel() : null,
        getChannels: id => id === GUILD ? [channel()] : [],
        getLoadedMessages: () => [message()],
        getMessages: () => { calls++; return read ? read() : Promise.resolve(response); }
    }, defaults, settings);
    controller.start();
    return { controller, settings, calls: () => calls, advance: ms => time += ms,
        response: value => response = value, reader: fn => read = fn, owner: id => owner = id, rename: value => name = value };
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test("owner attachment works with signed Discord CDN URL", () => {
    assert.equal(parseThemeMessage(message(), OWNER, defaults).url, IMAGE);
    assert.equal(parseThemeMessage(message(), OWNER, defaults).dim, 0.45);
});
test("a member, bot or webhook cannot set the shared wallpaper", () => {
    assert.equal(parseThemeMessage(message(undefined, { author: { id: OTHER } }), OWNER, defaults), null);
    assert.equal(parseThemeMessage(message(undefined, { author: { id: OWNER, bot: true } }), OWNER, defaults), null);
    assert.equal(parseThemeMessage(message(undefined, { webhook_id: OTHER }), OWNER, defaults), null);
    assert.equal(parseThemeMessage(message(), "", defaults), null);
});
test("external URLs, credentials and misleading domains are rejected", () => {
    for (const url of ["http://cdn.discordapp.com/attachments/a/b/a.png", "https://evil.example/attachments/a/b/a.png", "https://cdn.discordapp.com.evil.example/attachments/a/b/a.png", "https://user@cdn.discordapp.com/attachments/a/b/a.png", "file:///a.png", "https://cdn.discordapp.com/attachments/a/../a.png"]) assert.equal(safeImageUrl(url), null);
});
test("SVG, large images, videos and excessive dimensions are rejected", () => {
    const base = message().attachments[0];
    for (const value of [{ filename: "a.svg", content_type: "image/svg+xml" }, { size: defaults.maxImageBytes + 1 }, { width: 4097 }, { content_type: "video/mp4" }]) {
        assert.equal(parseThemeMessage(message(undefined, { attachments: [Object.assign({}, base, value)] }), OWNER, defaults), null);
    }
});
test("explicit owner command sets dim, blur or disables the image", () => {
    const image = parseThemeMessage(message(undefined, { content: "TŁO dim=0,7 blur=3" }), OWNER, defaults);
    assert.equal(image.dim, 0.7);
    assert.equal(image.blur, 3);
    assert.equal(parseThemeMessage(message(undefined, { content: "TLO dim=2 blur=99" }), OWNER, defaults).dim, 0.9);
    assert.equal(parseThemeMessage(message(undefined, { content: "TLO OFF" }), OWNER, defaults).enabled, false);
    assert.equal(parseThemeMessage(message(undefined, { content: "TŁO WYŁĄCZ" }), OWNER, defaults).enabled, false);
    assert.equal(parseThemeMessage(message(undefined, { content: "zwykła rozmowa", attachments: [] }), OWNER, defaults), null);
});
test("an owner image accepts an ordinary caption without interpreting it as options", () => {
    const theme = parseThemeMessage(message(undefined, { content: "Squid Game — By DonMillson, dim=0.9 blur=12" }), OWNER, defaults);
    assert.equal(theme.url, IMAGE);
    assert.equal(theme.dim, defaults.dim);
    assert.equal(theme.blur, defaults.blur);
    assert.equal(parseThemeMessage(message(undefined, { content: "Squid Game", author: { id: OTHER } }), OWNER, defaults), null);
});
test("diagnostics distinguishes a missing channel, a disabled switch and a different server", async () => {
    const s = setup();
    s.rename("other-channel");
    await s.controller.sync(GUILD, true);
    assert.match(s.controller.status(GUILD), /Nie znaleziono.*#tlo-serwera/);
    s.settings.enabled = false;
    assert.match(s.controller.contextProblem(GUILD), /wyłączone/);
    s.settings.enabled = true;
    s.settings.targetGuildId = OTHER;
    assert.match(s.controller.contextProblem(GUILD), /różni się/);
    delete s.settings.targetGuildId;
    assert.match(s.controller.contextProblem(""), /otwórz kanał/);
});
test("latest owner command wins without losing snowflake precision", () => {
    const old = message("100000000000000010");
    const off = message("100000000000000011", { content: "TLO OFF" });
    assert.equal(latestTheme([old, off], OWNER, defaults).enabled, false);
    assert.equal(compareIds("9007199254740993", "9007199254740992"), 1);
    assert.equal(compareIds("999999999999999999", "1000000000000000000"), -1);
});
test("channel detection excludes duplicates, DMs and other guilds", () => {
    const c = { id: CHANNEL, type: 0, name: "tlo-serwera", guild_id: GUILD };
    assert.equal(findThemeChannel([c], GUILD, "tlo-serwera"), c);
    assert.equal(findThemeChannel([c, Object.assign({}, c, { id: OTHER })], GUILD, "tlo-serwera"), null);
    assert.equal(findThemeChannel([c], OTHER, "tlo-serwera"), null);
    assert.equal(findThemeChannel([Object.assign({}, c, { type: 1 })], GUILD, "tlo-serwera"), null);
});
test("fresh install synchronizes, avoids DM leaks and throttles repeat requests", async () => {
    const s = setup();
    await s.controller.sync(GUILD);
    assert.equal(s.controller.snapshot(GUILD).url, IMAGE);
    assert.equal(s.controller.snapshot(""), null);
    assert.equal(s.controller.snapshot(OTHER), null);
    await s.controller.sync(GUILD);
    assert.equal(s.calls(), 1);
    s.advance(31000);
    await s.controller.sync(GUILD);
    assert.equal(s.calls(), 2);
});
test("owner transfer and channel rename invalidate a saved wallpaper immediately", async () => {
    const s = setup();
    await s.controller.sync(GUILD);
    s.owner(OTHER);
    assert.equal(s.controller.snapshot(GUILD), null);
    s.owner(OWNER);
    s.rename("other-channel");
    assert.equal(s.controller.snapshot(GUILD), null);
});
test("a saved snapshot cannot introduce arbitrary image URLs or invalid dimensions", async () => {
    const s = setup();
    await s.controller.sync(GUILD);
    s.settings.cache[GUILD].url = "https://evil.example/a.png";
    assert.equal(s.controller.snapshot(GUILD), null);
    s.settings.cache[GUILD].url = IMAGE;
    s.settings.cache[GUILD].dim = 999;
    assert.equal(s.controller.snapshot(GUILD).dim, 0.9);
});
test("global toggle, target guild filter and local dim override take effect immediately", async () => {
    const s = setup();
    await s.controller.sync(GUILD);
    s.settings.localDim = 0.8;
    assert.equal(s.controller.snapshot(GUILD).dim, 0.8);
    s.settings.enabled = false;
    assert.equal(s.controller.snapshot(GUILD), null);
    s.settings.enabled = true;
    s.settings.targetGuildId = OTHER;
    assert.equal(s.controller.snapshot(GUILD), null);
});
test("permission loss removes the cache, while a transient network failure preserves it", async () => {
    const s = setup();
    await s.controller.sync(GUILD);
    s.reader(() => Promise.reject(new Error("offline")));
    await s.controller.sync(GUILD, true);
    assert.ok(s.controller.snapshot(GUILD));
    s.reader(() => Promise.reject({ status: 403 }));
    await s.controller.sync(GUILD, true);
    assert.equal(s.controller.snapshot(GUILD), null);
});
test("429 backoff also applies to manual refresh", async () => {
    const s = setup();
    s.reader(() => Promise.reject({ status: 429, body: { retry_after: 120 } }));
    await s.controller.sync(GUILD, true);
    await s.controller.sync(GUILD, true);
    assert.equal(s.calls(), 1);
    s.advance(120001);
    s.response([]);
    s.reader(() => Promise.resolve([]));
    await s.controller.sync(GUILD, true);
    assert.equal(s.calls(), 2);
});
test("simultaneous refreshes coalesce and late responses cannot update after unload", async () => {
    const s = setup();
    let complete;
    s.reader(() => new Promise(resolve => complete = resolve));
    const first = s.controller.sync(GUILD, true);
    const second = s.controller.sync(GUILD, true);
    await tick();
    assert.equal(s.calls(), 1);
    s.controller.stop();
    complete([message()]);
    await Promise.all([first, second]);
    assert.equal(s.settings.cache[GUILD], undefined);
    assert.equal(s.controller.snapshot(GUILD), null);
});
test("a new owner message updates every live client and an older event cannot overwrite it", async () => {
    const s = setup();
    await s.controller.sync(GUILD);
    s.controller.event({ type: "MESSAGE_CREATE", message: message("100000000000000011", { content: "TLO OFF" }) });
    assert.equal(s.controller.snapshot(GUILD), null);
    s.controller.event({ type: "MESSAGE_CREATE", message: message() });
    assert.equal(s.controller.snapshot(GUILD), null);
    s.controller.event({ type: "MESSAGE_CREATE", message: message("100000000000000012") });
    assert.ok(s.controller.snapshot(GUILD));
});
test("deletion hides the image immediately without resurrecting the loaded stale message", async () => {
    const s = setup();
    await s.controller.sync(GUILD);
    s.response([]);
    const deletion = s.controller.event({ type: "MESSAGE_DELETE", channelId: CHANNEL, id: "100000000000000010" });
    assert.equal(s.controller.snapshot(GUILD), null);
    await deletion;
    assert.equal(s.controller.snapshot(GUILD), null);
});
test("editing the active message revalidates a partial gateway payload", async () => {
    const s = setup();
    await s.controller.sync(GUILD);
    s.response([message(undefined, { content: "TLO OFF" })]);
    await s.controller.event({ type: "MESSAGE_UPDATE", message: { id: "100000000000000010", channel_id: CHANNEL } });
    assert.equal(s.controller.snapshot(GUILD), null);
});
test("an old REST response cannot overwrite a newer gateway wallpaper", async () => {
    const s = setup();
    let first;
    const newer = message("100000000000000012", { content: "TLO OFF" });
    s.reader(() => s.calls() === 1 ? new Promise(resolve => first = resolve) : Promise.resolve([newer]));
    const pending = s.controller.sync(GUILD, true);
    await tick();
    s.controller.event({ type: "MESSAGE_CREATE", message: newer });
    first([message()]);
    await pending;
    await tick();
    assert.equal(s.calls(), 2);
    assert.equal(s.controller.snapshot(GUILD), null);
    assert.equal(s.settings.cache[GUILD].messageId, newer.id);
});
