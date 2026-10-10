(() => {
"use strict";

function clampNumber(value, fallback, min, max) {
    if (value === null || value === undefined || value === "") return fallback;
    const n = Number(value);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

function compareIds(a, b) {
    a = String(a || "");
    b = String(b || "");
    return a.length === b.length ? (a === b ? 0 : a > b ? 1 : -1) : a.length > b.length ? 1 : -1;
}

function safeImageUrl(value) {
    if (typeof value !== "string" || value.length > 4096) return null;
    // Hermes versions differ in their URL implementation. No global URL dependency.
    const match = /^https:\/\/(cdn\.discordapp\.com|media\.discordapp\.net)(\/attachments\/[^\s?#]+)(\?[^\s#]*)?$/i.exec(value);
    if (!match || /(?:^|[\/\\])\.\.(?:[\/\\]|$)/.test(match[2])) return null;
    return value;
}

function isSnowflake(value) {
    return typeof value === "string" && /^\d{15,22}$/.test(value);
}

function parseThemeMessage(message, ownerId, defaults) {
    if (!message || !ownerId || String(message.author?.id || "") !== String(ownerId)) return null;
    if (message.webhook_id || message.author?.bot || !isSnowflake(String(message.id || ""))) return null;
    const content = String(message.content || "").trim();
    const normalized = content.toLowerCase().replace(/ł/g, "l").replace(/ó/g, "o").replace(/ą/g, "a");
    if (/^!?tlo\s+(off|wylacz)$/.test(normalized)) {
        return { messageId: String(message.id), ownerId: String(ownerId), enabled: false };
    }
    const hasOptions = /^!?tlo(?:\s|$)/i.test(normalized);
    const attachments = Array.isArray(message.attachments) ? message.attachments : [];
    const attachment = attachments.find(a => {
        const mime = a?.content_type || a?.contentType || "";
        return /\.(png|jpe?g|webp)$/i.test(String(a?.filename || "")) &&
            (!mime || /^image\/(png|jpeg|webp)$/i.test(mime)) &&
            Number(a?.size || 0) <= defaults.maxImageBytes &&
            Number(a?.width || 0) <= defaults.maxImageDimension &&
            Number(a?.height || 0) <= defaults.maxImageDimension &&
            safeImageUrl(a?.url);
    });
    if (!attachment) return null;
    const options = {};
    const optionPattern = /\b(dim|blur)\s*=\s*([0-9]+(?:[.,][0-9]+)?)/g;
    let match;
    while (hasOptions && (match = optionPattern.exec(normalized))) {
        options[match[1]] = match[2].replace(",", ".");
    }
    return {
        messageId: String(message.id),
        ownerId: String(ownerId),
        enabled: true,
        url: safeImageUrl(attachment.url),
        dim: clampNumber(options.dim, defaults.dim, 0, 0.9),
        blur: clampNumber(options.blur, defaults.blur, 0, 20),
        filename: String(attachment.filename)
    };
}

function latestTheme(messages, ownerId, defaults) {
    return messages.map(m => parseThemeMessage(m, ownerId, defaults)).filter(Boolean)
        .sort((a, b) => -compareIds(a.messageId, b.messageId))[0] || null;
}

function findThemeChannel(channels, guildId, name) {
    const matches = channels.filter(c => c && String(c.guild_id || c.guildId || "") === String(guildId) &&
        c.type === 0 && c.name === name);
    // Duplicate names need an explicit resolution; do not arbitrarily trust the first channel.
    return matches.length === 1 ? matches[0] : null;
}

function retryDelay(error) {
    const seconds = error?.body?.retry_after ?? error?.response?.body?.retry_after ?? 5;
    return clampNumber(seconds, 5, 1, 3600) * 1000;
}

function createController(adapter, defaults, settings) {
    const statuses = Object.create(null);
    const inFlight = new Map();
    const fetchedAt = new Map();
    const revisions = new Map();
    let running = false;
    let generation = 0;
    let requestAfter = 0;
    if (!settings.cache || typeof settings.cache !== "object") settings.cache = {};
    const clock = adapter.now || Date.now;
    const notify = () => { try { adapter.changed(); } catch (_) {} };
    function status(guildId, text) {
        if (statuses[guildId] === text) return;
        statuses[guildId] = text;
        notify();
    }
    function resolveContext(guildId) {
        const fail = problem => ({ context: null, problem });
        if (!running) return fail("Dodatek nie jest uruchomiony.");
        if (settings.enabled === false) return fail("Tło jest wyłączone w ustawieniach pluginu.");
        if (!isSnowflake(String(guildId || ""))) return fail("Najpierw otwórz kanał tekstowy na swoim serwerze.");
        const target = settings.targetGuildId || defaults.targetGuildId;
        if (target && target !== String(guildId)) return fail("Otwarty serwer różni się od ID zapisanego w ustawieniach pluginu.");
        let guild, channels;
        try { guild = adapter.getGuild(guildId); channels = adapter.getChannels(guildId); } catch (_) { return fail("Nie udało się odczytać danych serwera lub jego kanałów."); }
        if (!guild) return fail("Nie odczytano danych serwera. Otwórz jego kanał i odśwież tło.");
        const ownerId = String(guild?.ownerId || guild?.owner_id || "");
        if (!isSnowflake(ownerId)) return fail("Nie odczytano właściciela serwera. Otwórz jego kanał i odśwież tło.");
        const name = settings.channelName || defaults.channelName;
        const matching = (channels || []).filter(c => c && String(c.guild_id || c.guildId || "") === String(guildId) && c.type === 0 && c.name === name);
        if (!matching.length) return fail("Nie znaleziono zwykłego kanału tekstowego #" + name + ". Sprawdź nazwę i dostęp do kanału.");
        if (matching.length > 1) return fail("Znaleziono kilka kanałów #" + name + ". Pozostaw jeden kanał o tej nazwie.");
        const channel = matching[0];
        if (!isSnowflake(String(channel.id))) return fail("Nie odczytano ID kanału tła.");
        return { context: { guildId: String(guildId), ownerId, channelId: String(channel.id) }, problem: null };
    }
    function context(guildId) {
        return resolveContext(guildId).context;
    }
    function sameContext(a, b) {
        return a && b && a.guildId === b.guildId && a.ownerId === b.ownerId && a.channelId === b.channelId;
    }
    function snapshot(guildId) {
        const ctx = context(guildId);
        const theme = settings.cache[guildId];
        if (!ctx || !theme || theme.ownerId !== ctx.ownerId || theme.channelId !== ctx.channelId) return null;
        if (!isSnowflake(theme.messageId)) return null;
        if (theme.enabled !== true || !safeImageUrl(theme.url)) return null;
        return Object.assign({}, theme, {
            dim: clampNumber(settings.localDim, clampNumber(theme.dim, defaults.dim, 0, 0.9), 0, 0.9),
            blur: clampNumber(theme.blur, defaults.blur, 0, 20)
        });
    }
    function accept(ctx, messages, authoritative) {
        if (!sameContext(ctx, context(ctx.guildId))) return;
        const theme = latestTheme(messages, ctx.ownerId, defaults);
        const previous = settings.cache[ctx.guildId];
        if (!authoritative && (!theme || previous && compareIds(theme.messageId, previous.messageId) < 0)) return;
        if (!theme) {
            delete settings.cache[ctx.guildId];
            status(ctx.guildId, "Brak grafiki właściciela w #" + (settings.channelName || defaults.channelName) + ".");
        } else {
            settings.cache[ctx.guildId] = Object.assign({}, theme, { channelId: ctx.channelId });
            status(ctx.guildId, theme.enabled ? "Tło: " + theme.filename : "Właściciel wyłączył tło.");
        }
        notify();
    }
    async function sync(guildId, force) {
        const resolved = resolveContext(guildId);
        const ctx = resolved.context;
        if (!ctx) {
            if (running) status(guildId || "", resolved.problem);
            return;
        }
        if (inFlight.has(ctx.guildId)) return inFlight.get(ctx.guildId);
        if (clock() < requestAfter) return;
        if (!force && fetchedAt.has(ctx.guildId) && clock() - fetchedAt.get(ctx.guildId) < defaults.minFetchMs) return;
        const ownGeneration = generation;
        const ownRevision = revisions.get(ctx.guildId) || 0;
        let superseded = false;
        try {
            const loaded = !force && adapter.getLoadedMessages?.(ctx.channelId);
            if (Array.isArray(loaded)) accept(ctx, loaded, false);
        } catch (_) {}
        status(ctx.guildId, "Sprawdzam grafikę właściciela…");
        fetchedAt.set(ctx.guildId, clock());
        const work = Promise.resolve().then(() => adapter.getMessages(ctx.channelId)).then(messages => {
            if (!running || generation !== ownGeneration || !sameContext(ctx, context(ctx.guildId))) return;
            if ((revisions.get(ctx.guildId) || 0) !== ownRevision) { superseded = true; return; }
            if (!Array.isArray(messages)) throw new Error("Niepoprawna odpowiedź listy wiadomości.");
            accept(ctx, messages, true);
        }).catch(error => {
            if (!running || generation !== ownGeneration) return;
            const code = Number(error?.status || error?.response?.status || error?.body?.status || 0);
            if (code === 429) {
                requestAfter = clock() + retryDelay(error);
                status(ctx.guildId, "Limit odczytów. Spróbuj ponownie za chwilę.");
            } else if (code === 403 || code === 404) {
                delete settings.cache[ctx.guildId];
                status(ctx.guildId, "Brak dostępu do kanału tła lub historii wiadomości.");
            } else {
                status(ctx.guildId, "Nie udało się odświeżyć tła. Sprawdź połączenie i użyj Odśwież.");
            }
        }).finally(() => {
            if (inFlight.get(ctx.guildId) === work) inFlight.delete(ctx.guildId);
            if (superseded && running && generation === ownGeneration) void sync(ctx.guildId, true);
        });
        inFlight.set(ctx.guildId, work);
        return work;
    }
    function event(action) {
        if (!running || !action) return;
        const channelId = String(action.channelId || action.channel_id || action.message?.channel_id || action.message?.channelId || "");
        let channel;
        try { channel = adapter.getChannel(channelId); } catch (_) { return; }
        const guildId = String(channel?.guild_id || channel?.guildId || "");
        const ctx = context(guildId);
        if (!ctx || ctx.channelId !== channelId) return;
        if (action.type === "MESSAGE_CREATE" && action.message) {
            if (!parseThemeMessage(action.message, ctx.ownerId, defaults)) return;
            revisions.set(guildId, (revisions.get(guildId) || 0) + 1);
            accept(ctx, [action.message], false);
        } else if (action.type === "MESSAGE_UPDATE") {
            revisions.set(guildId, (revisions.get(guildId) || 0) + 1);
            const cached = settings.cache[guildId];
            const messageId = String(action.message?.id || action.id || "");
            // Edited payloads can be partial. Hide a changed active image until validated again.
            if (cached?.messageId === messageId) { delete settings.cache[guildId]; notify(); }
            return sync(guildId, true);
        } else if (action.type === "MESSAGE_DELETE" || action.type === "MESSAGE_DELETE_BULK") {
            const ids = action.ids || [action.id || action.messageId];
            if (ids.some(id => String(id) === settings.cache[guildId]?.messageId)) {
                revisions.set(guildId, (revisions.get(guildId) || 0) + 1);
                delete settings.cache[guildId];
                notify();
                return sync(guildId, true);
            }
        }
    }
    return {
        start() { running = true; generation++; notify(); },
        stop() { running = false; generation++; inFlight.clear(); notify(); },
        context, snapshot, sync, event,
        contextProblem(guildId) { return resolveContext(guildId).problem; },
        status(guildId) { return statuses[guildId] || "Oczekuję na kanał tła."; },
        changed() { generation++; inFlight.clear(); notify(); },
        imageError(guildId) { status(guildId, "Nie udało się wczytać obrazka. Użyj Odśwież lub prześlij grafikę ponownie."); },
        isRunning() { return running; }
    };
}

// Node exports are removed from the installable bundle by the build script.

"use strict";

function createPlugin(api, defaults) {
    let React, RN, controller, stores = {}, http, dispatcher;
    let active = false;
    let chatPatched = false;
    let renderEnabled = false;
    let compatibility = "Dodatek nie jest uruchomiony.";
    const viewState = { channelId: "", imageKey: "", image: "Obraz nie został jeszcze przekazany do widoku czatu.", surfaceCount: 0 };
    const cleanup = [];
    const listeners = new Set();
    const timers = new Set();
    const brokenImages = new Set();
    const settings = api?.plugin?.storage || {};
    if (settings.enabled === undefined) settings.enabled = true;
    function safe(fn, fallback) { try { return fn(); } catch (_) { return fallback; } }
    function notify() { listeners.forEach(fn => safe(fn)); }
    function later(fn, ms) {
        const timer = setTimeout(() => { timers.delete(timer); if (active) fn(); }, ms);
        timers.add(timer);
        return timer;
    }
    function selectedChannelId() { return safe(() => String(stores.selected?.getChannelId?.() || ""), ""); }
    function getChannel(id) { return safe(() => stores.channels?.getChannel?.(id), null); }
    function guildForChannel(id) {
        const channel = getChannel(id);
        return String(channel?.guild_id || channel?.guildId || "");
    }
    function currentGuildId() {
        const id = guildForChannel(selectedChannelId());
        if (isSnowflake(id)) settings.lastGuildId = id;
        const selectedGuild = safe(() => String(stores.selectedGuild?.getGuildId?.() || ""), "");
        return id || (isSnowflake(selectedGuild) ? selectedGuild : "") || settings.targetGuildId || defaults.targetGuildId || settings.lastGuildId || "";
    }
    function channelsInGuild(guildId) {
        const found = new Map();
        const seen = new Set();
        function walk(value, depth) {
            if (!value || typeof value !== "object" || depth > 6 || seen.has(value)) return;
            seen.add(value);
            if (value.id && (value.guild_id || value.guildId)) {
                if (String(value.guild_id || value.guildId) === String(guildId)) found.set(String(value.id), value);
                return;
            }
            if (typeof value.get === "function" && typeof value.forEach === "function") {
                safe(() => value.forEach(child => walk(child, depth + 1)));
                return;
            }
            Object.keys(value).forEach(key => safe(() => walk(value[key], depth + 1)));
        }
        const sources = [
            () => stores.channels?.getMutableGuildChannelsForGuild?.(guildId),
            () => stores.channels?.getGuildChannels?.(guildId),
            () => stores.channels?.getGuildChannelsForGuild?.(guildId),
            () => stores.guildChannels?.getChannels?.(guildId)
        ];
        sources.forEach(source => walk(safe(source, null), 0));
        const name = settings.channelName || defaults.channelName;
        if (!Array.from(found.values()).some(c => c.type === 0 && c.name === name)) {
            walk(safe(() => stores.channels?.getChannels?.(), null), 0);
        }
        return Array.from(found.values());
    }
    function loadedMessages(id) {
        const value = safe(() => stores.messages?.getMessages?.(id), null);
        return Array.isArray(value) ? value : safe(() => value?.toArray?.(), null);
    }
    function messageRequest(id) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => { timers.delete(timer); reject(new Error("timeout")); }, 15000);
            timers.add(timer);
            Promise.resolve().then(() => http.get({ url: "/channels/" + id + "/messages", query: { limit: 100 } }))
                .then(response => {
                    const code = Number(response?.status || 0);
                    if (code >= 400) throw { status: code, body: response.body };
                    resolve(response?.body ?? response);
                }).catch(reject).finally(() => { clearTimeout(timer); timers.delete(timer); });
        });
    }
    function transparentTree(node, depth, budget) {
        if (!node || depth > 10 || budget.count++ > 160) return node;
        if (Array.isArray(node)) return node.map(child => transparentTree(child, depth + 1, budget));
        if (!React.isValidElement(node)) return node;
        const props = node.props || {};
        const patch = {};
        let changed = false;
        if ((depth === 0 && props.style !== undefined) || Object.prototype.hasOwnProperty.call(props, "HACK_fixModalInteraction")) {
            if (Object.prototype.hasOwnProperty.call(props, "HACK_fixModalInteraction")) budget.surfaceCount++;
            patch.style = [props.style, { backgroundColor: "transparent" }];
            changed = true;
        }
        if (props.children !== undefined) {
            const children = transparentTree(props.children, depth + 1, budget);
            if (children !== props.children) { patch.children = children; changed = true; }
        }
        return changed ? React.cloneElement(node, patch) : node;
    }
    function useUpdates() {
        const pair = React.useState(0);
        React.useEffect(() => {
            const listener = () => pair[1](x => x + 1);
            listeners.add(listener);
            return () => listeners.delete(listener);
        }, []);
    }
    function Background(props) {
        useUpdates();
        const guildId = guildForChannel(props.channelId);
        React.useEffect(() => { if (active && guildId) void controller?.sync(guildId, false); }, [guildId]);
        const theme = controller?.snapshot(guildId);
        if (!active || !renderEnabled || !theme || brokenImages.has(theme.url)) return props.original;
        const imageKey = theme.messageId + theme.url;
        if (viewState.imageKey !== imageKey) {
            viewState.imageKey = imageKey;
            viewState.image = "Wczytuję obraz: " + theme.filename;
        }
        const budget = { count: 0, surfaceCount: 0 };
        const original = transparentTree(props.original, 0, budget);
        viewState.surfaceCount = budget.surfaceCount;
        const fill = { position: "absolute", left: 0, top: 0, right: 0, bottom: 0 };
        return React.createElement(RN.View, { style: { flex: 1, height: "100%" }, collapsable: false },
            React.createElement(RN.Image, {
                key: imageKey,
                source: { uri: theme.url }, resizeMode: "cover", blurRadius: theme.blur,
                style: fill, pointerEvents: "none", accessible: false,
                onLoad() { if (active && viewState.imageKey === imageKey) { viewState.image = "Obraz wczytany: " + theme.filename; notify(); } },
                onError() { if (!active) return; brokenImages.add(theme.url); if (viewState.imageKey === imageKey) viewState.image = "Błąd wczytania obrazu: " + theme.filename; controller.imageError(guildId); notify(); }
            }),
            React.createElement(RN.View, {
                pointerEvents: "none", accessible: false,
                style: [fill, { backgroundColor: "rgba(0,0,0," + theme.dim + ")" }]
            }),
            React.createElement(RN.View, { style: { flex: 1, backgroundColor: "transparent" } },
                original)
        );
    }
    let Boundary;
    function channelIdFrom(props) {
        const explicit = props?.channelId || props?.channel_id || props?.channel?.id;
        // An explicit DM must never inherit a currently selected guild's wallpaper.
        return explicit ? String(explicit) : selectedChannelId();
    }
    function installChatPatch() {
        if (chatPatched || !active || !React || !RN) return chatPatched;
        const metro = api.metro;
        const candidates = [];
        for (const name of ["MessagesConnected", "Messages"]) {
            for (const finder of ["findByDisplayName", "findByTypeName", "findByName"]) {
                const value = safe(() => metro[finder]?.(name), null);
                if (value) candidates.push({ value, name });
                const module = safe(() => metro[finder]?.(name, false), null);
                if (module) candidates.push({ value: module.default || module[name] || module, name });
            }
        }
        for (const candidate of candidates) {
            const value = candidate.value;
            const targets = [value, value?.type, value?.prototype];
            for (const target of targets) {
                if (!target || typeof target.render !== "function") continue;
                const unpatch = safe(() => api.patcher.after("render", target, (args, original) => {
                    if (!active || !original) return original;
                    try {
                        const channelId = channelIdFrom(args[0]);
                        viewState.channelId = channelId;
                        const child = React.createElement(Background, { channelId, original });
                        return React.createElement(Boundary, { key: channelId, original }, child);
                    } catch (_) { return original; }
                }), null);
                if (!unpatch) continue;
                cleanup.push(unpatch);
                chatPatched = true;
                renderEnabled = true;
                compatibility = "Wykryto widok czatu: " + candidate.name + ".";
                notify();
                return true;
            }
        }
        compatibility = "Nie wykryto zgodnego widoku czatu. Otwórz kanał i sprawdź ponownie; potrzebny może być port do Twojej wersji Discorda.";
        notify();
        return false;
    }
    function refresh(force) {
        if (!active) return Promise.resolve();
        if (!controller && !initialize()) { notify(); return Promise.resolve(); }
        installChatPatch();
        const guildId = currentGuildId();
        if (!guildId) { notify(); return Promise.resolve(); }
        if (force) brokenImages.clear();
        notify();
        return controller.sync(guildId, force);
    }
    function diagnosticText() {
        const info = safe(() => api.debug?.getDebugInfo?.(), null);
        const guildId = currentGuildId();
        const status = controller ? controller.contextProblem(guildId) || controller.status(guildId) : "Odczyt wiadomości nie jest uruchomiony.";
        const context = controller?.context(guildId);
        const userId = safe(() => String(stores.users?.getCurrentUser?.()?.id || ""), "");
        return [
            "SG Server Backgrounds " + defaults.version + " — By DonMillson",
            "Discord: " + (info?.discord?.version || "brak danych") + " (build " + (info?.discord?.build || "?") + ")",
            "Revenge: " + (info?.bunny?.version || info?.vendetta?.version || api.version || "brak danych"),
            compatibility,
            "Serwer: " + (safe(() => stores.guilds?.getGuild?.(guildId)?.name, "") || (guildId ? "wykryty" : "niewykryty")),
            "Kanał konfiguracji: #" + (settings.channelName || defaults.channelName),
            "Liczba wykrytych kanałów serwera: " + channelsInGuild(guildId).length,
            "Właściciel serwera: " + (context && userId ? userId === context.ownerId ? "tak" : "nie; grafikę musi wysłać właściciel" : "brak danych"),
            "Odczyt: " + status,
            "Widok wiadomości po włączeniu: " + (viewState.channelId ? "wykryty" : "jeszcze niewykryty"),
            viewState.image,
            "Kontener listy wiadomości: " + (viewState.surfaceCount ? "wykryty" : "niewykryty")
        ].join("\n");
    }
    function Settings() {
        if (!React || !RN) return null;
        useUpdates();
        const [targetDraft, setTargetDraft] = React.useState(settings.targetGuildId || defaults.targetGuildId || "");
        const [channelDraft, setChannelDraft] = React.useState(settings.channelName || defaults.channelName);
        const [dimDraft, setDimDraft] = React.useState(settings.localDim == null ? "" : String(settings.localDim));
        const [feedback, setFeedback] = React.useState("");
        const guildId = currentGuildId();
        const textStyle = { color: "#f3f4f7", fontSize: 16, marginBottom: 10 };
        const inputStyle = { color: "#ffffff", backgroundColor: "#232630", borderRadius: 9, padding: 12, marginBottom: 16, fontSize: 16 };
        const el = React.createElement;
        const text = (value, extra) => el(RN.Text, { style: Object.assign({}, textStyle, extra) }, value);
        const input = (value, onChangeText, placeholder, numeric) => el(RN.TextInput, {
            value, onChangeText, placeholder, placeholderTextColor: "#a0a6b6", style: inputStyle,
            autoCapitalize: "none", autoCorrect: false, keyboardType: numeric ? "decimal-pad" : "default"
        });
        const button = (label, fn) => el(RN.TouchableOpacity, {
            accessibilityRole: "button", onPress: fn,
            style: { backgroundColor: "#c83c76", borderRadius: 9, padding: 13, marginBottom: 12 }
        }, text(label, { marginBottom: 0, textAlign: "center", fontWeight: "700" }));
        return el(RN.ScrollView, { style: { flex: 1, backgroundColor: "#13151b" }, contentContainerStyle: { padding: 20, paddingBottom: 60 } },
            text(defaults.name, { fontSize: 24, fontWeight: "800" }),
            text("By DonMillson", { fontSize: 16, fontWeight: "700", color: "#ec72a3" }),
            text("Własna grafika za wiadomościami. Obraz publikuje właściciel w #" + (settings.channelName || defaults.channelName) + "."),
            el(RN.View, { style: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 } },
                text("Włącz tło", { marginBottom: 0 }),
                el(RN.Switch, { value: settings.enabled !== false, onValueChange: value => { settings.enabled = value; controller?.changed(); if (value) void refresh(true); } })
            ),
            text("ID serwera (puste = wykrywaj #tlo-serwera)"),
            input(targetDraft, setTargetDraft, "ID serwera lub puste", true),
            button("Użyj obecnie otwartego serwera", () => { if (guildId) setTargetDraft(guildId); else setFeedback("Najpierw otwórz kanał na serwerze."); }),
            text("Nazwa kanału z grafiką"), input(channelDraft, setChannelDraft, "tlo-serwera"),
            text("Własne przyciemnienie: 0–0,9 (puste = z serwera)"), input(dimDraft, setDimDraft, "automatyczne", true),
            button("Zapisz ustawienia", () => {
                const target = targetDraft.trim();
                const channel = channelDraft.trim().replace(/^#/, "");
                const dimText = dimDraft.trim().replace(",", ".");
                const dim = dimText === "" ? null : Number(dimText);
                if (target && !isSnowflake(target)) return setFeedback("ID serwera musi być numerem skopiowanym z Discorda.");
                if (!channel || !/^[a-z0-9_-]{1,100}$/.test(channel)) return setFeedback("Użyj prostej nazwy kanału, np. tlo-serwera.");
                if (dim !== null && (!Number.isFinite(dim) || dim < 0 || dim > 0.9)) return setFeedback("Przyciemnienie musi być pomiędzy 0 a 0,9.");
                settings.targetGuildId = target;
                settings.channelName = channel;
                settings.localDim = dim;
                controller?.changed();
                setFeedback("Zapisano.");
                void refresh(true);
            }),
            button("Odśwież tło", () => { void refresh(true); }),
            feedback ? text(feedback, { color: "#86e5ad" }) : null,
            text("Diagnostyka", { fontSize: 20, fontWeight: "700", marginTop: 12 }),
            text(diagnosticText(), { fontSize: 14, selectable: true }),
            button("Kopiuj diagnostykę", () => {
                const clipboard = safe(() => api.metro.common.clipboard, null);
                if (!clipboard?.setString) return setFeedback("Zrób zrzut ekranu powyższej diagnostyki.");
                try {
                    Promise.resolve(clipboard.setString(diagnosticText())).then(() => setFeedback("Skopiowano diagnostykę."), () => setFeedback("Zrób zrzut ekranu powyższej diagnostyki."));
                } catch (_) { setFeedback("Zrób zrzut ekranu powyższej diagnostyki."); }
            }),
            text("Instrukcja dla właściciela", { fontSize: 20, fontWeight: "700", marginTop: 12 }),
            text("Utwórz jeden kanał tekstowy #tlo-serwera. Daj członkom dostęp do kanału i historii, a wysyłanie pozostaw dla siebie. Wyślij PNG, JPG lub WEBP jako zwykły załącznik. Obraz do 10 MB i 4096 px na bok."),
            text("Możesz dodać podpis: TLO dim=0.45 blur=0. Aby wyłączyć wspólne tło, wyślij: TLO OFF. Po skasowaniu ostatniej grafiki wróci poprzednia dostępna grafika właściciela."),
            text("Każdy członek potrzebuje Revenge Classic i tego pluginu. Sam Revenge nie pobiera tego dodatku. Wersja beta wymaga testu widoczności tła na Twoim telefonie.", { fontSize: 14, color: "#bbc1d0" })
        );
    }
    function initialize() {
            if (!active || controller) return Boolean(controller);
            React = safe(() => api.metro.common.React);
            RN = safe(() => api.metro.common.ReactNative);
            if (!React?.createElement || !React?.Component || !RN?.Image || !RN?.View) {
                compatibility = "Brak zgodnego API React Native. Użyj Revenge Classic.";
                return false;
            }
            Boundary = class extends React.Component {
                constructor(props) { super(props); this.state = { failed: false }; }
                static getDerivedStateFromError() { return { failed: true }; }
                componentDidCatch() {
                    renderEnabled = false;
                    compatibility = "Tło zostało wyłączone po błędzie wyświetlania. Otwórz ponownie czat; potrzebny może być port do tej wersji aplikacji.";
                    notify();
                }
                render() { return this.state.failed ? this.props.original : this.props.children; }
            };
            function store(name) { return safe(() => api.metro.findByStoreName(name), null); }
            stores = { selected: store("SelectedChannelStore"), channels: store("ChannelStore"),
                guilds: store("GuildStore"), messages: store("MessageStore"), guildChannels: store("GuildChannelStore"),
                selectedGuild: store("SelectedGuildStore"), users: store("UserStore") };
            http = safe(() => api.metro.findByProps("getAPIBaseURL"), null);
            dispatcher = safe(() => api.metro.common.FluxDispatcher, null);
            if (!http?.get || !stores.channels?.getChannel || !stores.guilds?.getGuild || !stores.selected?.getChannelId) {
                const missing = [!http?.get && "odczyt wiadomości", !stores.channels?.getChannel && "kanały", !stores.guilds?.getGuild && "serwery", !stores.selected?.getChannelId && "wybrany kanał"].filter(Boolean);
                compatibility = "Nie znaleziono API: " + missing.join(", ") + ". Użyj Odśwież po otwarciu kanału.";
                notify();
                return false;
            }
            controller = createController({
                getGuild: id => stores.guilds.getGuild(id), getChannel, getChannels: channelsInGuild,
                getLoadedMessages: loadedMessages, getMessages: messageRequest, changed: notify
            }, defaults, settings);
            controller.start();
            installChatPatch();
            if (dispatcher?.subscribe && dispatcher?.unsubscribe) {
                const events = ["MESSAGE_CREATE", "MESSAGE_UPDATE", "MESSAGE_DELETE", "MESSAGE_DELETE_BULK", "CHANNEL_SELECT", "GUILD_UPDATE", "CHANNEL_CREATE", "CHANNEL_UPDATE", "CHANNEL_DELETE", "CONNECTION_OPEN"];
                for (const name of events) {
                    const callback = action => {
                        const result = safe(() => controller.event(Object.assign({}, action, { type: name })));
                        if (result?.catch) result.catch(() => {});
                        if (!name.startsWith("MESSAGE_")) later(() => { void refresh(false); }, 0);
                    };
                    const subscribed = safe(() => { dispatcher.subscribe(name, callback); return true; }, false);
                    if (subscribed) cleanup.push(() => dispatcher.unsubscribe(name, callback));
                }
            }
            const appSubscription = safe(() => RN.AppState?.addEventListener?.("change", state => {
                if (state === "active") void refresh(false);
            }), null);
            if (appSubscription?.remove) cleanup.push(() => appSubscription.remove());
            const interval = setInterval(() => {
                if (active && (!RN.AppState || RN.AppState.currentState === "active")) void refresh(false);
            }, defaults.refreshMs);
            cleanup.push(() => clearInterval(interval));
            // Components can be loaded lazily on first opening a channel.
            let attempts = 0;
            function retryPatch() {
                if (!active || chatPatched || attempts++ >= 12) return;
                installChatPatch();
                if (!chatPatched) later(retryPatch, 5000);
            }
            if (!chatPatched) later(retryPatch, 5000);
            void refresh(false);
            return true;
    }
    return {
        onLoad() {
            active = true;
            let attempts = 0;
            function retryInitialize() {
                if (!active || controller || attempts++ >= 12) return;
                if (!initialize()) later(retryInitialize, 3000);
            }
            retryInitialize();
        },
        onUnload() {
            active = false;
            renderEnabled = false;
            controller?.stop();
            controller = null;
            timers.forEach(timer => clearTimeout(timer));
            timers.clear();
            cleanup.splice(0).reverse().forEach(fn => safe(fn));
            chatPatched = false;
            brokenImages.clear();
            Object.assign(viewState, { channelId: "", imageKey: "", image: "Obraz nie został jeszcze przekazany do widoku czatu.", surfaceCount: 0 });
            compatibility = "Dodatek nie jest uruchomiony.";
            notify();
        },
        settings: Settings
    };
}

// Node exports are removed from the installable bundle by the build script.

return createPlugin(vendetta, {"name":"SG Server Backgrounds","version":"0.1.0-beta.3","targetGuildId":"","channelName":"tlo-serwera","dim":0.45,"blur":0,"refreshMs":300000,"minFetchMs":30000,"maxImageBytes":10485760,"maxImageDimension":4096});
})()
